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

  // ---- QR payload: {n: 이름, d: 날짜ISO, t: 발급시각ms} → base64url ----
  function encode(name, dateISO) {
    var json = JSON.stringify({ n: name, d: dateISO, t: Date.now() });
    var bytes = new TextEncoder().encode(json);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(token) {
    try {
      var b64 = token.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var data = JSON.parse(new TextDecoder().decode(bytes));
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
