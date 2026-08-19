'use strict';

/**
 * VoiceInput — Smart Audio & Continuous VAD Speech Controller for Sparky AI.
 * Ses aktivite algılama (VAD), hassas mikrofon analizi ve sessizlik sonrası oto-üretim.
 */

class VoiceInput {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onResult] - Callback with transcribed text (text)
   * @param {Function} [options.onStateChange] - Callback with state ('idle'|'listening'|'processing'|'error')
   * @param {Function} [options.onAutoSubmit] - Callback when silence triggers auto generation
   * @param {Function} [options.onError] - Callback with error message
   * @param {boolean} [options.autoSubmit=true] - Auto generate after prolonged silence
   * @param {Object} [options.api] - Electron API bridge
   */
  constructor(options = {}) {
    this.onResult = options.onResult || null;
    this.onStateChange = options.onStateChange || null;
    this.onAutoSubmit = options.onAutoSubmit || null;
    this.onError = options.onError || null;
    // Canlı yazma: her cümle parçası çözümlendiğinde o ana kadarki tam metni yollar.
    this.onPartial = options.onPartial || null;
    // Anlık mikrofon genliği (0..1) — avatar ve baloncuğun sese tepki vermesi için.
    this.onLevel = options.onLevel || null;
    this.autoSubmit = options.autoSubmit !== false;
    this.api = options.api || (typeof window !== 'undefined' ? (window.api || (typeof api !== 'undefined' ? api : null)) : null);
    this.state = 'idle';
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.vadTimer = null;
    this.startTime = 0;
    this.lastSpeechTime = 0;
    this.hasSpoken = false;
    this.silenceSubmitMs = 2400;  // Bu kadar sessizlik → bitir ve üret
    this.segmentSilenceMs = 850;  // Bu kadar duraklama → parçayı yazıya çevir (canlı yazma)
    this.committedText = '';      // Şimdiye dek kesinleşmiş metin
    this.flushing = false;        // Parça çözümleme kilidi (yarış önleme)
    // Ayarlardan seçilen mikrofon; boş/'default' ise sistem varsayılanı.
    this.deviceId = options.deviceId || '';
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /**
   * Mikrofon akışını açar. Ayarlarda belirli bir cihaz seçilmişse onu dener;
   * o cihaz o an yoksa (sanal mikrofonlar gelip gidebiliyor) sessizce sistem
   * varsayılanına düşer — kullanıcı "cihaz bulunamadı" duvarına toslamasın.
   */
  async _openMicStream() {
    const deviceId = this.deviceId;
    if (deviceId && deviceId !== 'default') {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } }
        });
      } catch (err) {
        // Seçili cihaz kayıpsa varsayılanla devam et.
        if (err?.name !== 'NotFoundError' && err?.name !== 'OverconstrainedError') throw err;
        console.warn('[VoiceInput] Seçili mikrofon bulunamadı, varsayılana dönülüyor.');
      }
    }
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }

  /** Kullanılabilir mikrofonları listeler (ayarlar ekranı için). */
  static async listMicrophones() {
    if (!VoiceInput.isSupported()) return [];
    try {
      // Etiketlerin dolu gelmesi için izin verilmiş olmalı; kısa bir akış açıp
      // hemen kapatmak Chromium'un etiketleri açığa çıkarmasını sağlar.
      let probe = null;
      try { probe = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { /* izin yoksa etiketsiz listeleriz */ }
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (probe) probe.getTracks().forEach((t) => t.stop());
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Mikrofon' }));
    } catch {
      return [];
    }
  }

  /** Mikrofon hatasını kullanıcının çözebileceği bir yönergeye çevirir. */
  static describeMicError(err) {
    const name = err?.name || '';
    switch (name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Mikrofon izni reddedildi. Windows → Ayarlar → Gizlilik ve güvenlik → Mikrofon bölümünden "Uygulamaların mikrofonunuza erişmesine izin verin" ve "Masaüstü uygulamalarının mikrofona erişmesine izin verin" seçeneklerini açın, sonra uygulamayı yeniden başlatın.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'Mikrofon bulunamadı. Bir mikrofon takılı mı ve Windows ses ayarlarında etkin mi kontrol edin.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Mikrofon başka bir uygulama tarafından kullanılıyor (Zoom, Teams, Discord…). O uygulamayı kapatıp tekrar deneyin.';
      case 'OverconstrainedError':
        return 'Seçili mikrofon istenen ayarları desteklemiyor. Windows ses ayarlarından varsayılan cihazı değiştirmeyi deneyin.';
      case 'SecurityError':
        return 'Güvenlik kısıtı nedeniyle mikrofon açılamadı. Uygulamayı yeniden başlatın.';
      default:
        return `Mikrofon açılamadı (${name || 'bilinmeyen hata'}): ${err?.message || ''}`;
    }
  }

  setState(newState) {
    this.state = newState;
    this.onStateChange?.(this.state);
  }

  async start() {
    if (this.state === 'listening') return false;
    if (!VoiceInput.isSupported()) {
      this.onError?.('Mikrofon erişimi bu ortamda desteklenmiyor.');
      return false;
    }

    try {
      this.stream = await this._openMicStream();
      this.audioChunks = [];
      this.hasSpoken = false;
      this.startTime = Date.now();
      this.lastSpeechTime = Date.now();

      this.committedText = '';
      this.flushing = false;
      this._startRecorder();
      await this.initVad(this.stream);
      this.setState('listening');
      return true;
    } catch (err) {
      this.setState('error');
      // getUserMedia'nın ham mesajı ("Permission denied") kullanıcıya ne
      // yapacağını söylemiyor. DOMException adına göre uygulanabilir bir
      // yönlendirme veriyoruz — sorunun uygulamada mı, Windows gizlilik
      // ayarında mı, donanımda mı olduğu tek bakışta anlaşılsın.
      this.onError?.(VoiceInput.describeMicError(err));
      return false;
    }
  }

  /**
   * Yeni bir MediaRecorder başlatır. Parça çözümlemede kaydedici durdurulup
   * yeniden başlatılıyor; çünkü webm akışında ilk parçadan sonrakiler tek
   * başına çözülebilir değil (başlık yok). Durdurup yeniden başlatmak her
   * segmentin geçerli, bağımsız bir ses dosyası olmasını sağlar.
   */
  _startRecorder() {
    if (!this.stream) return;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data?.size > 0) this.audioChunks.push(e.data);
    };
    this.mediaRecorder.start(250);
  }

  /** Kaydediciyi durdurup biriken parçaları döndürür (son parça dahil). */
  async _stopRecorderAndCollect() {
    const rec = this.mediaRecorder;
    if (rec && rec.state !== 'inactive') {
      await new Promise((resolve) => {
        rec.onstop = resolve;
        try { rec.stop(); } catch { resolve(); }
      });
    }
    const collected = this.audioChunks;
    this.audioChunks = [];
    return collected;
  }

  /** Ses parçalarını yazıya çevirir. Backend'den bağımsız (bulut ya da yerel). */
  async _transcribeChunks(chunks) {
    if (!chunks || !chunks.length) return '';
    const audioBlob = new Blob(chunks, { type: 'audio/webm' });
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const apiBridge = this.api || (typeof window !== 'undefined' ? (window.api || (typeof api !== 'undefined' ? api : null)) : null);
    if (!apiBridge?.voice?.transcribe) throw new Error('Ses servisi bulunamadı.');
    const res = await apiBridge.voice.transcribe(uint8Array);
    if (!res?.ok) throw new Error(res?.error || 'Sesli tanıma başarısız.');
    return String(res.text || '').trim();
  }

  /**
   * Konuşma duraklamasında o ana kadarki cümleyi yazıya çevirip ekrana basar,
   * sonra dinlemeye kaldığı yerden devam eder — "canlı yazma" bu.
   */
  async _flushSegment() {
    if (this.flushing || this.state !== 'listening') return;
    this.flushing = true;
    try {
      const chunks = await this._stopRecorderAndCollect();

      // Kullanıcı konuşmaya devam edebilir; kaydı hemen yeniden aç ki ses kaybolmasın.
      if (this.state === 'listening' && this.stream) {
        this._startRecorder();
        this.hasSpoken = false;
        this.lastSpeechTime = Date.now();
      }

      if (chunks.length) {
        const text = await this._transcribeChunks(chunks);
        if (text) {
          this.committedText = this.committedText ? `${this.committedText} ${text}` : text;
          this.onPartial?.(this.committedText);
        }
      }
    } catch (err) {
      // Parça hatası akışı bozmasın; kullanıcı konuşmaya devam edebilsin.
      console.warn('[VoiceInput] Parça çözümlenemedi:', err.message);
    } finally {
      this.flushing = false;
    }
  }

  async initVad(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      this.vadTimer = setInterval(() => {
        if (this.state !== 'listening') return;
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength;

        // Genliği 0..1 aralığına indirip dışarı ver — avatar/baloncuk buna göre nefes alır.
        // 60 pratikte normal konuşma tepe değeri; üstü tavanlanır.
        this.onLevel?.(Math.min(1, avg / 60));

        const now = Date.now();
        // Sensitive threshold (>= 4 detects whispering/quiet mics)
        if (avg >= 4) {
          this.lastSpeechTime = now;
          this.hasSpoken = true;
        } else {
          const silentFor = now - this.lastSpeechTime;
          if (this.hasSpoken && silentFor >= this.silenceSubmitMs) {
            // Uzun sessizlik: bitir, kalanı çöz ve üretimi tetikle.
            this.stopAndProcess(true);
          } else if (this.hasSpoken && silentFor >= this.segmentSilenceMs && !this.flushing) {
            // Kısa duraklama: o ana kadarki cümleyi yazıya çevir, dinlemeye devam et.
            // Canlı yazma hissi buradan geliyor.
            this._flushSegment();
          } else if (!this.hasSpoken && (now - this.startTime) >= 7000) {
            // No speech detected at all for 7s: cancel listening
            this.stop();
          }
        }
      }, 150);
    } catch {}
  }

  cleanupStream() {
    if (this.vadTimer) { clearInterval(this.vadTimer); this.vadTimer = null; }
    if (this.audioCtx) { try { this.audioCtx.close(); } catch {} this.audioCtx = null; }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  stop() {
    this.cleanupStream();
    if (this.mediaRecorder && this.state === 'listening') {
      try { this.mediaRecorder.stop(); } catch {}
    }
    this.setState('idle');
  }

  async stopAndProcess(shouldAutoSubmit = false) {
    if (this.state !== 'listening') return;

    // Devam eden bir parça çözümlemesi varsa bitmesini bekle (metin sırası bozulmasın).
    let guard = 0;
    while (this.flushing && guard++ < 40) {
      await new Promise((r) => setTimeout(r, 50));
    }

    this.cleanupStream();
    this.setState('processing');
    this.onLevel?.(0);

    const chunks = await this._stopRecorderAndCollect();

    try {
      // Kalan son parçayı da çöz ve biriken metne ekle.
      if (chunks.length) {
        const tail = await this._transcribeChunks(chunks);
        if (tail) {
          this.committedText = this.committedText ? `${this.committedText} ${tail}` : tail;
        }
      }

      const finalText = this.committedText.trim();
      if (!finalText) {
        this.setState('idle');
        return;
      }

      this.onResult?.(finalText);
      this.committedText = '';
      this.setState('idle');
      if (shouldAutoSubmit && this.autoSubmit) {
        setTimeout(() => this.onAutoSubmit?.(), 300);
      }
    } catch (err) {
      // Daha önce kesinleşmiş metin varsa onu kaybetme — kullanıcının emeği gitmesin.
      const salvaged = this.committedText.trim();
      if (salvaged) {
        this.onResult?.(salvaged);
        this.committedText = '';
        this.setState('idle');
      } else {
        this.setState('error');
        this.onError?.(err.message || 'Ses hatası');
      }
    }
  }

  toggle() {
    if (this.state === 'listening') {
      this.stopAndProcess(false);
      return false;
    } else {
      return this.start();
    }
  }
}

if (typeof window !== 'undefined') window.VoiceInput = VoiceInput;
if (typeof module !== 'undefined' && module.exports) module.exports = VoiceInput;
