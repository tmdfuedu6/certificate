/*
 * MSW 크리에이터 스쿨 수료증 — 공용 합성 모듈 (kiosk.html, cert.html 공용)
 *
 * 개인정보 원칙: 학생 이름은 어디에도 저장·전송하지 않는다.
 *  - 이름은 QR URL의 #fragment 에만 담긴다 (fragment 는 브라우저가 서버로 보내지 않음)
 *  - localStorage / sessionStorage / console 에 이름을 남기지 않는다
 *
 * 좌표는 template_blank.png 원본(1787×2527px) 기준.
 */
(function (global) {
  'use strict';

  var TEMPLATE_SRC = 'template_blank.png';
  var FONT_FAMILY = 'Pretendard';

  // 이름: "교육명" 값(MSW 크리에이터 스쿨)과 같은 x 에서 시작, 왼쪽 정렬
  var NAME_LAYOUT = {
    x: 389,          // 글자 왼쪽 끝 (원본 샘플 391, 글꼴 여백 보정)
    centerY: 764.5,  // 글자 세로 중심 (원본 샘플 746~783)
    size: 45,        // px
    letterSpacing: -4.5,
    align: 'left',
    color: '#1D1B1B',
    maxWidth: 1000,  // 넘으면 자동 축소
    ref: '김넥슨'     // 세로 위치 기준 문자열 (이름마다 높이가 흔들리지 않도록)
  };

  // 날짜: 페이지 가운데 정렬, "YYYY. MM. DD"
  var DATE_LAYOUT = {
    x: 891,          // 가운데 기준 (페이지 중앙 893, 자간 보정)
    centerY: 1898,   // 원본 샘플 1877~1919
    size: 59,
    letterSpacing: -3,
    align: 'center',
    color: '#1D1B1B',
    maxWidth: 800,
    ref: '2026. 06. 10'
  };

  var QR_TTL_MS = 30 * 60 * 1000; // QR 유효시간 30분

  function fontString(size) {
    return size + 'px "' + FONT_FAMILY + '"';
  }

  function loadTemplate() {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('수료증 배경 이미지를 불러오지 못했습니다.')); };
      img.src = TEMPLATE_SRC;
    });
  }

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load(fontString(NAME_LAYOUT.size), '김넥슨'),
      document.fonts.load(fontString(DATE_LAYOUT.size), '2026. 06. 10')
    ]);
  }

  // 템플릿과 폰트를 한 번만 준비
  var readyPromise = null;
  function ready() {
    if (!readyPromise) {
      readyPromise = Promise.all([loadTemplate(), loadFonts()]).then(function (r) { return r[0]; });
    }
    return readyPromise;
  }

  function drawText(ctx, text, layout) {
    var size = layout.size;
    ctx.letterSpacing = (layout.letterSpacing || 0) + 'px';
    ctx.font = fontString(size);
    var w = ctx.measureText(text).width;
    if (w > layout.maxWidth) {
      size = Math.floor(size * layout.maxWidth / w);
      ctx.font = fontString(size);
    }
    // 기준 문자열의 잉크 높이로 세로 중심을 맞춘다
    var m = ctx.measureText(layout.ref);
    var baseline = layout.centerY + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    ctx.fillStyle = layout.color;
    ctx.textAlign = layout.align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, layout.x, baseline);
  }

  // "2026-10-20" → "2026. 10. 20"
  function formatDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return '';
    return p[0] + '. ' + p[1] + '. ' + p[2];
  }

  function todayISO() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  /** canvas 에 수료증을 그린다. name/date(ISO) 중 빈 값은 건너뜀 */
  function render(canvas, name, dateISO, layouts) {
    return ready().then(function (img) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var L = layouts || {};
      if (name) drawText(ctx, name, L.name || NAME_LAYOUT);
      var dateText = formatDate(dateISO);
      if (dateText) drawText(ctx, dateText, L.date || DATE_LAYOUT);
      return canvas;
    });
  }

  // ---- QR payload 암호화 (ChaCha20, RFC 8439) ----
  // QR 스캔 앱·AI(구글렌즈 등)가 Base64를 풀어 이름을 읽지 못하게 한다.
  // 키가 공개 코드에 있으므로 "지나가다 노출"을 막는 용도이며, 코드를 분석하는 공격까지 막지는 못한다.
  var CIPHER_KEY = 'dd6338c718d58772ab2c8a8a358b17e669d4c0aa7f19eeb138775d995a0b4552';
  var NONCE_BYTES = 12;

  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function wordsLE(bytes) {
    var w = new Uint32Array(bytes.length / 4);
    for (var i = 0; i < w.length; i++) {
      w[i] = bytes[i * 4] | (bytes[i * 4 + 1] << 8) | (bytes[i * 4 + 2] << 16) | (bytes[i * 4 + 3] << 24);
    }
    return w;
  }

  function chachaBlock(key, counter, nonce) {
    var s = new Uint32Array([
      0x61707865, 0x3320646e, 0x79622d32, 0x6b206574,
      key[0], key[1], key[2], key[3], key[4], key[5], key[6], key[7],
      counter, nonce[0], nonce[1], nonce[2]
    ]);
    var x = new Uint32Array(s);
    function qr(a, b, c, d) {
      x[a] += x[b]; x[d] ^= x[a]; x[d] = (x[d] << 16) | (x[d] >>> 16);
      x[c] += x[d]; x[b] ^= x[c]; x[b] = (x[b] << 12) | (x[b] >>> 20);
      x[a] += x[b]; x[d] ^= x[a]; x[d] = (x[d] << 8) | (x[d] >>> 24);
      x[c] += x[d]; x[b] ^= x[c]; x[b] = (x[b] << 7) | (x[b] >>> 25);
    }
    for (var i = 0; i < 10; i++) {
      qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15);
      qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14);
    }
    var out = new Uint8Array(64);
    for (var j = 0; j < 16; j++) {
      var v = (x[j] + s[j]) >>> 0;
      out[j * 4] = v & 255; out[j * 4 + 1] = (v >>> 8) & 255;
      out[j * 4 + 2] = (v >>> 16) & 255; out[j * 4 + 3] = v >>> 24;
    }
    return out;
  }

  // 암호화·복호화 동일 연산 (keystream XOR)
  function chacha20(keyBytes, nonceBytes, data) {
    var key = wordsLE(keyBytes), nonce = wordsLE(nonceBytes);
    var out = new Uint8Array(data.length);
    for (var off = 0, counter = 1; off < data.length; off += 64, counter++) {
      var ks = chachaBlock(key, counter, nonce);
      for (var i = 0; i < 64 && off + i < data.length; i++) out[off + i] = data[off + i] ^ ks[i];
    }
    return out;
  }

  function toBase64Url(bytes) {
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(token) {
    var b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // {n: 이름, d: 날짜ISO, t: 발급시각ms} → base64url(nonce 12바이트 + 암호문)
  function encode(name, dateISO) {
    var json = JSON.stringify({ n: name, d: dateISO, t: Date.now() });
    var nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
    var cipher = chacha20(hexToBytes(CIPHER_KEY), nonce, new TextEncoder().encode(json));
    var packed = new Uint8Array(NONCE_BYTES + cipher.length);
    packed.set(nonce, 0);
    packed.set(cipher, NONCE_BYTES);
    return toBase64Url(packed);
  }

  function decode(token) {
    try {
      var packed = fromBase64Url(token);
      if (packed.length <= NONCE_BYTES) return null;
      var plain = chacha20(hexToBytes(CIPHER_KEY), packed.subarray(0, NONCE_BYTES), packed.subarray(NONCE_BYTES));
      var data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
      if (!data || typeof data.n !== 'string' || !data.n) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function isExpired(data) {
    return typeof data.t !== 'number' || Date.now() - data.t > QR_TTL_MS;
  }

  global.Certificate = {
    NAME_LAYOUT: NAME_LAYOUT,
    DATE_LAYOUT: DATE_LAYOUT,
    QR_TTL_MS: QR_TTL_MS,
    ready: ready,
    render: render,
    formatDate: formatDate,
    todayISO: todayISO,
    encode: encode,
    decode: decode,
    isExpired: isExpired
  };
})(window);
