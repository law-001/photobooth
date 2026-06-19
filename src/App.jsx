import React from "react";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

// ---- static config ----
const COUNTDOWN_DEFAULT = 3;
const SHUTTER_SOUND_DEFAULT = true;
const GIF_DELAY = 90; // ms per flipbook frame
const BURST_FRAMES = 6; // frames grabbed per shot for the flipbook

const LAYOUTS = {
  "classic-4": { label: "Classic strip", cols: 1, rows: 4, ar: 4 / 3, slots: 4 },
  "strip-3": { label: "Trio strip", cols: 1, rows: 3, ar: 4 / 3, slots: 3 },
  "grid-2x2": { label: "2 × 2 grid", cols: 2, rows: 2, ar: 1, slots: 4 },
  single: { label: "Single shot", cols: 1, rows: 1, ar: 4 / 3, slots: 1 },
};

const FILTERS = [
  { id: "original", label: "Original", css: "none" },
  { id: "bw", label: "B&W", css: "grayscale(1) contrast(1.05)" },
  { id: "sepia", label: "Sepia", css: "sepia(0.78) contrast(1.02)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.42) contrast(1.1) saturate(1.25) brightness(1.02)" },
  { id: "cool", label: "Cool", css: "saturate(1.25) hue-rotate(-12deg) brightness(1.02)" },
  { id: "punch", label: "Vivid", css: "contrast(1.4) saturate(1.32)" },
  { id: "glow", label: "Soft glow", css: "brightness(1.12) contrast(0.94) saturate(1.08) blur(0.4px)" },
];

// pastel frame colours
const FRAMES = [
  { name: "White", hex: "#FFFFFF" },
  { name: "Pink", hex: "#FAD9E2" },
  { name: "Peach", hex: "#FBE3D6" },
  { name: "Butter", hex: "#FBF3D6" },
  { name: "Mint", hex: "#D8F0E3" },
  { name: "Sky", hex: "#DCE6FA" },
  { name: "Lavender", hex: "#EBE2FA" },
  { name: "Charcoal", hex: "#2B2622" },
];

// decorative strip themes — each pairs a motif with a matching pastel
const THEMES = [
  { id: "none", label: "None" },
  { id: "bow", label: "Pink bow", motif: "bow", tint: "#E48FA8", frame: "#FAD9E2" },
  { id: "hearts", label: "Hearts", motif: "heart", tint: "#E48FA8", frame: "#FBE3D6" },
  { id: "stars", label: "Stars", motif: "star", tint: "#7FA0E0", frame: "#DCE6FA" },
  { id: "daisy", label: "Daisies", motif: "daisy", tint: "#E8B84B", frame: "#FBF3D6" },
  { id: "sparkle", label: "Sparkle", motif: "sparkle", tint: "#A488DE", frame: "#EBE2FA" },
  { id: "mint", label: "Clovers", motif: "clover", tint: "#5FB98C", frame: "#D8F0E3" },
];

// border padding presets (frame margin + gap + photo corner radius)
const BORDERS = [
  { id: "vthin", label: "Very thin", pad: 14, gap: 8, r: 6 },
  { id: "thin", label: "Thin", pad: 26, gap: 14, r: 11 },
  { id: "thick", label: "Thick", pad: 42, gap: 22, r: 16 },
];

// palette
const INK = "#2E2A26";
const MUTED = "#8C8278";
const LINE = "rgba(46,42,38,0.12)";
const ACC = "#37312B";
const CREAM = "#FAF6EF";

// glass surfaces
const GLASS = "rgba(255,255,255,0.55)";
const GLASS_SOFT = "rgba(255,255,255,0.4)";
const GLASS_BORDER = "rgba(255,255,255,0.65)";
const BLUR = "blur(18px) saturate(150%)";

const merge = (a, b) => Object.assign({}, a, b);

export default class App extends React.Component {
  state = {
    stage: "camera",
    layoutId: "classic-4",
    filterId: "original",
    countdown: COUNTDOWN_DEFAULT,
    facing: "user",
    cameraError: null,
    streamReady: false,
    count: 0,
    flash: false,
    captureIndex: 0,
    heroCount: 0,
    frameColor: "#FFFFFF",
    theme: "none",
    borderStyle: "thin",
    dateStamp: true,
    soundOn: SHUTTER_SOUND_DEFAULT,
    stripUrl: null,
    gifUrl: null,
    gifBusy: false,
    gifError: false,
  };

  constructor(props) {
    super(props);
    this.videoRef = React.createRef();
    this._heroes = [];
    this._burst = [];
  }

  componentDidMount() {
    this.startCamera();
  }
  componentWillUnmount() {
    this.stopCamera();
  }
  componentDidUpdate(pp, ps) {
    if (ps.stage !== "camera" && this.state.stage === "camera") this.startCamera();
    if (ps.facing !== this.state.facing && this.state.stage === "camera") this.startCamera();
    if (
      this.state.stage === "review" &&
      (ps.frameColor !== this.state.frameColor ||
        ps.theme !== this.state.theme ||
        ps.borderStyle !== this.state.borderStyle ||
        ps.dateStamp !== this.state.dateStamp ||
        ps.filterId !== this.state.filterId)
    ) {
      this.compose();
    }
  }

  // ---------- camera ----------
  async startCamera() {
    try {
      if (this._stream) this._stream.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.state.facing },
        audio: false,
      });
      this._stream = stream;
      const v = this.videoRef.current;
      if (v) {
        v.srcObject = stream;
        try {
          await v.play();
        } catch (e) {}
      }
      this.setState({ cameraError: null, streamReady: true });
    } catch (e) {
      this.setState({ cameraError: e && e.name ? e.name : "error", streamReady: false });
    }
  }
  stopCamera() {
    if (this._stream) this._stream.getTracks().forEach((t) => t.stop());
    this._stream = null;
  }

  // ---------- helpers ----------
  wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  loadImg(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
  }
  filterCss() {
    const f = FILTERS.find((x) => x.id === this.state.filterId);
    return f ? f.css : "none";
  }
  burstN() {
    return Math.max(3, Math.min(14, BURST_FRAMES));
  }
  dateString() {
    return new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  theme() {
    return THEMES.find((t) => t.id === this.state.theme) || THEMES[0];
  }

  geom(layoutId, hasTheme, borderId) {
    const L = LAYOUTS[layoutId];
    const b = BORDERS.find((x) => x.id === borderId) || BORDERS[1];
    const pad = b.pad + (hasTheme ? 12 : 0);
    const gap = b.gap;
    const r = b.r;
    const topH = hasTheme ? 56 : pad;
    const footerH = 60;
    const slotW = L.cols >= 2 ? 300 : 440;
    const slotH = Math.round(slotW / L.ar);
    const w = pad * 2 + L.cols * slotW + (L.cols - 1) * gap;
    const h = topH + L.rows * slotH + (L.rows - 1) * gap + footerH;
    return { L, pad, gap, r, topH, footerH, slotW, slotH, w, h, hair: 1.4 };
  }
  roundRect(cx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    cx.beginPath();
    cx.moveTo(x + r, y);
    cx.arcTo(x + w, y, x + w, y + h, r);
    cx.arcTo(x + w, y + h, x, y + h, r);
    cx.arcTo(x, y + h, x, y, r);
    cx.arcTo(x, y, x + w, y, r);
    cx.closePath();
  }
  isLight(hex) {
    const n = hex.replace("#", "");
    const r = parseInt(n.substr(0, 2), 16),
      g = parseInt(n.substr(2, 2), 16),
      b = parseInt(n.substr(4, 2), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
  }
  drawCover(cx, dw, dh) {
    const v = this.videoRef.current;
    if (!v || !v.videoWidth) {
      cx.fillStyle = "#2a2420";
      cx.fillRect(0, 0, dw, dh);
      return;
    }
    const vw = v.videoWidth,
      vh = v.videoHeight,
      tr = dw / dh,
      vr = vw / vh;
    let sw, sh, sx, sy;
    if (vr > tr) {
      sh = vh;
      sw = vh * tr;
      sx = (vw - sw) / 2;
      sy = 0;
    } else {
      sw = vw;
      sh = vw / tr;
      sx = 0;
      sy = (vh - sh) / 2;
    }
    cx.save();
    if (this.state.facing === "user") {
      cx.translate(dw, 0);
      cx.scale(-1, 1);
    }
    cx.drawImage(v, sx, sy, sw, sh, 0, 0, dw, dh);
    cx.restore();
  }

  // ---------- motifs (drawn on the strip) ----------
  // deterministic PRNG so the scatter is stable across recomposes
  hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // scatter motifs randomly around the border (never over the photos)
  scatterMotifs(cx, theme, g) {
    const rnd = this.rng(this.hashSeed(theme.id + g.L.rows + "x" + g.L.cols));
    const ax = g.pad,
      ay = g.topH,
      aw = g.w - g.pad * 2,
      ah = g.h - g.footerH - g.topH;
    const count = 18;
    let placed = 0,
      tries = 0;
    while (placed < count && tries < 600) {
      tries++;
      const x = 9 + rnd() * (g.w - 18);
      const y = 9 + rnd() * (g.h - 18);
      const m = 8;
      const overPhotos = x > ax - m && x < ax + aw + m && y > ay - m && y < ay + ah + m;
      if (overPhotos) continue;
      const overText = y > g.h - g.footerH + 2 && Math.abs(x - g.w / 2) < g.w * 0.36;
      if (overText) continue;
      const size = 4.5 + rnd() * 7;
      cx.save();
      cx.translate(x, y);
      cx.rotate((rnd() - 0.5) * 0.9);
      cx.globalAlpha = 0.78 + rnd() * 0.22;
      this.drawMotif(cx, theme.motif, 0, 0, size, theme.tint);
      cx.restore();
      placed++;
    }
  }
  drawMotif(cx, id, x, y, s, color) {
    switch (id) {
      case "bow":
        this.mBow(cx, x, y, s, color);
        break;
      case "heart":
        this.mHeart(cx, x, y, s, color);
        break;
      case "star":
        this.mStar(cx, x, y, s, color);
        break;
      case "daisy":
        this.mDaisy(cx, x, y, s, color);
        break;
      case "sparkle":
        this.mSparkle(cx, x, y, s, color);
        break;
      case "clover":
        this.mClover(cx, x, y, s, color);
        break;
    }
  }
  mBow(cx, x, y, s, color) {
    cx.save();
    cx.translate(x, y);
    cx.fillStyle = color;
    const w = s * 1.05,
      h = s * 0.72;
    cx.beginPath();
    cx.moveTo(0, 0);
    cx.lineTo(-w, -h);
    cx.quadraticCurveTo(-w * 1.15, 0, -w, h);
    cx.closePath();
    cx.fill();
    cx.beginPath();
    cx.moveTo(0, 0);
    cx.lineTo(w, -h);
    cx.quadraticCurveTo(w * 1.15, 0, w, h);
    cx.closePath();
    cx.fill();
    cx.beginPath();
    cx.moveTo(-s * 0.12, 0);
    cx.lineTo(-s * 0.62, h * 1.55);
    cx.lineTo(-s * 0.05, h * 0.5);
    cx.closePath();
    cx.fill();
    cx.beginPath();
    cx.moveTo(s * 0.12, 0);
    cx.lineTo(s * 0.62, h * 1.55);
    cx.lineTo(s * 0.05, h * 0.5);
    cx.closePath();
    cx.fill();
    cx.beginPath();
    cx.arc(0, 0, s * 0.26, 0, Math.PI * 2);
    cx.fill();
    cx.restore();
  }
  mHeart(cx, x, y, t, color) {
    cx.save();
    cx.fillStyle = color;
    cx.beginPath();
    cx.moveTo(x, y + t * 0.3);
    cx.bezierCurveTo(x, y - t * 0.1, x - t, y - t * 0.1, x - t, y + t * 0.35);
    cx.bezierCurveTo(x - t, y + t * 0.8, x, y + t * 1.02, x, y + t * 1.2);
    cx.bezierCurveTo(x, y + t * 1.02, x + t, y + t * 0.8, x + t, y + t * 0.35);
    cx.bezierCurveTo(x + t, y - t * 0.1, x, y - t * 0.1, x, y + t * 0.3);
    cx.closePath();
    cx.fill();
    cx.restore();
  }
  mStar(cx, cx0, cy0, r, color) {
    cx.save();
    cx.fillStyle = color;
    cx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = cx0 + Math.cos(ang) * rad,
        py = cy0 + Math.sin(ang) * rad;
      i === 0 ? cx.moveTo(px, py) : cx.lineTo(px, py);
    }
    cx.closePath();
    cx.fill();
    cx.restore();
  }
  mDaisy(cx, x, y, s, color) {
    cx.save();
    cx.translate(x, y);
    cx.fillStyle = color;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      cx.beginPath();
      cx.ellipse(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5, s * 0.34, s * 0.2, a, 0, Math.PI * 2);
      cx.fill();
    }
    cx.beginPath();
    cx.fillStyle = "#F6C85A";
    cx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
    cx.fill();
    cx.restore();
  }
  mSparkle(cx, x, y, s, color) {
    cx.save();
    cx.translate(x, y);
    cx.fillStyle = color;
    cx.beginPath();
    cx.moveTo(0, -s);
    cx.quadraticCurveTo(0, 0, s, 0);
    cx.quadraticCurveTo(0, 0, 0, s);
    cx.quadraticCurveTo(0, 0, -s, 0);
    cx.quadraticCurveTo(0, 0, 0, -s);
    cx.closePath();
    cx.fill();
    cx.restore();
  }
  mClover(cx, x, y, s, color) {
    cx.save();
    cx.translate(x, y);
    cx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      cx.beginPath();
      cx.arc(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45, s * 0.4, 0, Math.PI * 2);
      cx.fill();
    }
    cx.fillRect(-s * 0.08, s * 0.2, s * 0.16, s * 0.7);
    cx.restore();
  }

  // ---------- audio ----------
  audioCtx() {
    if (!this._ac) {
      try {
        this._ac = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {}
    }
    return this._ac;
  }
  tick() {
    if (!this.state.soundOn) return;
    const ac = this.audioCtx();
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = 640;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.13);
  }

  // ---------- capture ----------
  async runSequence() {
    if (!this.state.streamReady) return;
    this.audioCtx();
    this._heroes = [];
    this._burst = [];
    const slots = LAYOUTS[this.state.layoutId].slots;
    this.setState({
      stage: "capturing",
      captureIndex: 0,
      heroCount: 0,
      gifUrl: null,
      stripUrl: null,
      gifError: false,
    });
    await this.wait(350);
    for (let i = 0; i < slots; i++) {
      this.setState({ captureIndex: i });
      await this.countdown(this.state.countdown);
      await this.flash();
      this._heroes.push(this.grabHero());
      const b = await this.grabBurst(this.burstN());
      for (const f of b) this._burst.push(f);
      this.setState({ heroCount: this._heroes.length });
      await this.wait(520);
    }
    await this.compose();
    this.stopCamera();
    this.setState({ stage: "review", count: 0, streamReady: false });
  }
  async countdown(sec) {
    for (let n = sec; n >= 1; n--) {
      this.setState({ count: n });
      this.tick();
      await this.wait(1000);
    }
    this.setState({ count: 0 });
  }
  async flash() {
    this.setState({ flash: true });
    await this.wait(150);
    this.setState({ flash: false });
  }
  grabHero() {
    const g = this.geom(this.state.layoutId, false, this.state.borderStyle);
    const DPR = 2;
    const c = document.createElement("canvas");
    c.width = g.slotW * DPR;
    c.height = g.slotH * DPR;
    const cx = c.getContext("2d");
    cx.scale(DPR, DPR);
    this.drawCover(cx, g.slotW, g.slotH);
    return c.toDataURL("image/jpeg", 0.92);
  }
  async grabBurst(n) {
    const out = [];
    const ar = LAYOUTS[this.state.layoutId].ar;
    const bw = 300,
      bh = Math.round(bw / ar);
    for (let i = 0; i < n; i++) {
      const c = document.createElement("canvas");
      c.width = bw;
      c.height = bh;
      this.drawCover(c.getContext("2d"), bw, bh);
      out.push(c.toDataURL("image/jpeg", 0.82));
      await this.wait(55);
    }
    return out;
  }

  // ---------- compose strip (sharp corners) ----------
  async compose() {
    if (!this._heroes || !this._heroes.length) return;
    const { layoutId, dateStamp } = this.state;
    const theme = this.theme();
    const hasTheme = theme.id !== "none";
    const g = this.geom(layoutId, hasTheme, this.state.borderStyle);
    const DPR = 2;
    const cv = document.createElement("canvas");
    cv.width = g.w * DPR;
    cv.height = g.h * DPR;
    const cx = cv.getContext("2d");
    cx.scale(DPR, DPR);
    const fc = this.state.frameColor;
    cx.fillStyle = fc;
    cx.fillRect(0, 0, g.w, g.h);

    const css = this.filterCss();
    const imgs = await Promise.all(this._heroes.map((s) => this.loadImg(s)));
    let k = 0;
    for (let r = 0; r < g.L.rows; r++) {
      for (let c = 0; c < g.L.cols; c++) {
        const x = g.pad + c * (g.slotW + g.gap);
        const y = g.topH + r * (g.slotH + g.gap);
        cx.save();
        this.roundRect(cx, x, y, g.slotW, g.slotH, g.r);
        cx.clip();
        cx.filter = css === "none" ? "none" : css;
        const im = imgs[k];
        if (im) cx.drawImage(im, x, y, g.slotW, g.slotH);
        else {
          cx.fillStyle = "#cdc2b2";
          cx.fillRect(x, y, g.slotW, g.slotH);
        }
        cx.filter = "none";
        cx.restore();
        cx.strokeStyle = "rgba(0,0,0,0.12)";
        cx.lineWidth = g.hair;
        this.roundRect(cx, x, y, g.slotW, g.slotH, g.r);
        cx.stroke();
        k++;
      }
    }

    const light = this.isLight(fc);
    const tcol = light ? "rgba(40,34,28,0.72)" : "rgba(255,250,242,0.9)";

    // theme decoration — scattered around the border
    if (hasTheme) this.scatterMotifs(cx, theme, g);

    // footer text
    cx.fillStyle = tcol;
    cx.textAlign = "center";
    const fy = g.h - g.footerH / 2;
    cx.font = "700 11px 'JetBrains Mono', monospace";
    cx.fillText("P H O T O   ·   B O O T H", g.w / 2, dateStamp ? fy - 7 : fy + 4);
    if (dateStamp) {
      cx.font = "400 13px 'Hanken Grotesk', sans-serif";
      cx.fillText(this.dateString(), g.w / 2, fy + 13);
    }
    this.setState({ stripUrl: cv.toDataURL("image/png") });
  }

  // ---------- flipbook GIF ----------
  async genGif() {
    if (!this._burst || !this._burst.length) return;
    this.setState({ gifBusy: true, gifError: false });
    try {
      await this.wait(30);
      const imgs = await Promise.all(this._burst.map((s) => this.loadImg(s)));
      const w = imgs[0].naturalWidth,
        h = imgs[0].naturalHeight;
      const css = this.filterCss();
      const enc = GIFEncoder();
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      const delay = Math.max(40, Math.min(220, GIF_DELAY));
      for (const im of imgs) {
        cx.clearRect(0, 0, w, h);
        cx.filter = css === "none" ? "none" : css;
        cx.drawImage(im, 0, 0, w, h);
        cx.filter = "none";
        const data = cx.getImageData(0, 0, w, h).data;
        const pal = quantize(data, 256);
        const idx = applyPalette(data, pal);
        enc.writeFrame(idx, w, h, { palette: pal, delay });
      }
      enc.finish();
      const blob = new Blob([enc.bytes()], { type: "image/gif" });
      if (this._gifUrl) URL.revokeObjectURL(this._gifUrl);
      this._gifUrl = URL.createObjectURL(blob);
      this.setState({ gifUrl: this._gifUrl, gifBusy: false });
    } catch (e) {
      this.setState({ gifBusy: false, gifError: true });
    }
  }

  download(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- render ----------
  render() {
    const s = this.state;
    const camera = s.stage === "camera",
      capturing = s.stage === "capturing",
      review = s.stage === "review";
    const mirror = s.facing === "user";
    const fcss = this.filterCss();
    const slots = LAYOUTS[s.layoutId].slots;

    const glass = {
      background: GLASS,
      backdropFilter: BLUR,
      WebkitBackdropFilter: BLUR,
      border: "1px solid " + GLASS_BORDER,
    };

    const layoutBase = {
      display: "flex",
      flexDirection: "column",
      gap: "1px",
      alignItems: "flex-start",
      padding: "10px 13px",
      borderRadius: "13px",
      border: "1px solid " + LINE,
      background: GLASS_SOFT,
      cursor: "pointer",
      textAlign: "left",
      fontFamily: "inherit",
      color: INK,
      flex: "1 1 calc(50% - 4px)",
      transition: "all 140ms ease",
      lineHeight: 1.2,
    };
    const layoutAct = {
      borderColor: ACC,
      background: "rgba(55,49,43,0.08)",
      boxShadow: "inset 0 0 0 1px " + ACC,
    };
    const pillBase = {
      padding: "7px 13px",
      borderRadius: "999px",
      border: "1px solid " + LINE,
      background: GLASS_SOFT,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: "12.5px",
      color: INK,
      transition: "all 140ms ease",
    };
    const pillAct = { background: ACC, borderColor: ACC, color: CREAM };
    const swBase = {
      width: "30px",
      height: "30px",
      borderRadius: "50%",
      cursor: "pointer",
      border: "2px solid rgba(0,0,0,0.1)",
      padding: 0,
      transition: "all 140ms ease",
    };

    const secondaryStyle = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      padding: "10px 14px",
      borderRadius: "12px",
      border: "1px solid " + LINE,
      background: GLASS_SOFT,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: "13px",
      fontWeight: 500,
      color: INK,
      flex: 1,
      transition: "all 140ms ease",
    };
    const soundStyle = merge(
      secondaryStyle,
      s.soundOn ? {} : { color: MUTED, background: "rgba(255,255,255,0.25)" },
    );
    const primaryBtn = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      padding: "13px 18px",
      borderRadius: "14px",
      border: "none",
      background: ACC,
      color: CREAM,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: "15px",
      fontWeight: 600,
      width: "100%",
      boxShadow: "0 8px 20px rgba(46,42,38,0.25)",
      transition: "all 140ms ease",
    };
    const startDisabled = camera && !s.streamReady;
    const startBtnStyle = startDisabled
      ? merge(primaryBtn, {
          background: "rgba(140,130,120,0.4)",
          color: MUTED,
          boxShadow: "none",
          cursor: "not-allowed",
        })
      : primaryBtn;
    const gifBtnStyle = merge(secondaryStyle, {
      width: "100%",
      flex: "none",
      padding: "12px",
      fontWeight: 600,
      opacity: s.gifBusy ? 0.7 : 1,
      cursor: s.gifBusy ? "default" : "pointer",
    });
    const ghostStyle = {
      padding: "11px",
      borderRadius: "12px",
      border: "1px solid " + LINE,
      background: "transparent",
      color: MUTED,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: "14px",
      width: "100%",
      transition: "all 140ms ease",
    };
    const dateToggleStyle = {
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      padding: "4px 2px",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: "14px",
      color: INK,
    };
    const dateBoxStyle = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "22px",
      height: "22px",
      borderRadius: "7px",
      border: "1px solid " + (s.dateStamp ? ACC : LINE),
      background: s.dateStamp ? ACC : "transparent",
      color: CREAM,
      fontSize: "13px",
      transition: "all 140ms ease",
    };
    const labelStyle = {
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: "10px",
      letterSpacing: "1.5px",
      textTransform: "uppercase",
      color: MUTED,
      marginBottom: "8px",
    };

    const errMap = {
      NotAllowedError:
        "Camera permission was blocked. Allow access in your browser, then try again.",
      NotFoundError: "No camera was found on this device.",
      NotReadableError: "The camera is in use by another app. Close it and retry.",
    };

    const stageLabel = camera ? "Set up your shoot" : capturing ? "Capturing" : "Review & export";
    const statusDot = s.streamReady ? "#5C9A6B" : s.cameraError ? "#C16A4A" : "#C9B79C";
    const statusText = s.streamReady ? "Camera live" : s.cameraError ? "No camera" : "Connecting";
    const progressText = "shot " + Math.min(s.captureIndex + 1, slots) + " of " + slots;
    const camIcon = (extra) => (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={extra}
      >
        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2l1-1.6A1 1 0 0 1 8.5 4h7a1 1 0 0 1 .8.4L17.3 6h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
        <circle cx="12" cy="12.5" r="3.4" />
      </svg>
    );

    return (
      <div
        className="pb-outer"
        style={{
          minHeight: "100vh",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
          fontFamily: "'Hanken Grotesk',system-ui,sans-serif",
          color: INK,
          background:
            "radial-gradient(110% 110% at 0% 0%, #FCE3EC 0%, rgba(252,227,236,0) 45%)," +
            "radial-gradient(110% 110% at 100% 0%, #DCE7FB 0%, rgba(220,231,251,0) 45%)," +
            "radial-gradient(120% 120% at 50% 100%, #FBF3D8 0%, rgba(251,243,216,0) 50%)," +
            "linear-gradient(165deg,#F6F1EA,#EEE7F1)",
        }}
      >
        <div className="pb-shell">
          {/* thin glass header */}
          <div
            className="pb-topbar"
            style={merge(glass, {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 18px",
              borderRadius: "14px",
              boxShadow: "0 6px 18px rgba(60,50,40,0.07)",
            })}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontFamily: "'Sora',sans-serif",
                fontWeight: 600,
                fontSize: "14px",
                letterSpacing: "0.2px",
              }}
            >
              {camIcon()}
              photobooth
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "10.5px",
                letterSpacing: "1px",
                color: MUTED,
              }}
            >
              made by law
            </span>
          </div>

          {/* main glass card */}
          <div
            className="pb-card"
            style={merge(glass, {
              borderRadius: "24px",
              overflow: "hidden",
              boxShadow: "0 24px 60px -24px rgba(60,45,40,0.4)",
            })}
          >
            {/* subtle status row */}
            <div
              className="pb-statusrow"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "13px 20px",
                borderBottom: "1px solid " + LINE,
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "10.5px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
              }}
            >
              <span style={{ color: MUTED }}>{stageLabel}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  color: MUTED,
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: statusDot,
                  }}
                />
                {statusText}
              </span>
            </div>

            {/* body */}
            <div className="pb-body" style={{ padding: "18px" }}>
              {/* viewport */}
              <div
                className={review ? "pb-review-stage" : "pb-viewport"}
                style={
                  review
                    ? {
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }
                    : {
                        position: "relative",
                        borderRadius: "16px",
                        overflow: "hidden",
                        background: "#17120f",
                        aspectRatio: "4/3",
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.2)",
                      }
                }
              >
                {(camera || capturing) && (
                  <video
                    ref={this.videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                      filter: fcss === "none" ? "none" : fcss,
                      transform: mirror ? "scaleX(-1)" : "none",
                      background: "#17120f",
                    }}
                  />
                )}
                {review && s.stripUrl && (
                  <img
                    src={s.stripUrl}
                    alt="photo strip"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "min(74vh, 820px)",
                      width: "auto",
                      boxShadow: "0 18px 40px -12px rgba(60,45,40,0.35)",
                    }}
                  />
                )}
                {capturing && s.count > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(10,7,5,0.28)",
                    }}
                  >
                    <div
                      className="pb-count-num"
                      style={{
                        fontFamily: "'Sora',sans-serif",
                        fontWeight: 700,
                        fontSize: "150px",
                        color: "#FBF7EF",
                        textShadow: "0 6px 30px rgba(0,0,0,0.55)",
                      }}
                    >
                      <span
                        key={s.count}
                        style={{
                          display: "inline-block",
                          animation: "cdpop 800ms cubic-bezier(.2,.8,.2,1)",
                        }}
                      >
                        {String(s.count)}
                      </span>
                    </div>
                  </div>
                )}
                {capturing && (
                  <div
                    style={{
                      position: "absolute",
                      top: "14px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "rgba(23,18,15,0.72)",
                      color: "#FBF7EF",
                      padding: "6px 15px",
                      borderRadius: "999px",
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "11px",
                      letterSpacing: "1.5px",
                    }}
                  >
                    {progressText}
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "#fff",
                    opacity: s.flash ? 0.92 : 0,
                    transition: s.flash ? "opacity 30ms" : "opacity 320ms ease-out",
                    pointerEvents: "none",
                  }}
                />
                {camera && !!s.cameraError && !s.streamReady && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      padding: "26px",
                      background: "#1c1612",
                      color: "#EFE7D7",
                    }}
                  >
                    <svg
                      width="34"
                      height="34"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ opacity: 0.8 }}
                    >
                      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2l1-1.6A1 1 0 0 1 8.5 4h7a1 1 0 0 1 .8.4L17.3 6h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
                      <circle cx="12" cy="12.5" r="3.4" />
                      <line x1="3" y1="3" x2="21" y2="21" />
                    </svg>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 600, fontSize: "16px" }}>
                      Camera unavailable
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#B7A990",
                        maxWidth: "240px",
                        lineHeight: 1.4,
                      }}
                    >
                      {errMap[s.cameraError] || "Something went wrong reaching the camera."}
                    </div>
                    <button
                      type="button"
                      onClick={() => this.startCamera()}
                      style={{
                        marginTop: "6px",
                        padding: "9px 18px",
                        borderRadius: "999px",
                        border: "1px solid rgba(255,255,255,0.25)",
                        background: "transparent",
                        color: "#EFE7D7",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>

              {/* side panel */}
              <div className="pb-panel">
                {camera && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "17px" }}>
                    <div>
                      <div style={labelStyle}>Layout</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {Object.keys(LAYOUTS).map((id) => {
                          const L = LAYOUTS[id];
                          const act = s.layoutId === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => this.setState({ layoutId: id })}
                              style={act ? merge(layoutBase, layoutAct) : layoutBase}
                            >
                              <span style={{ fontWeight: 600, fontSize: "13px" }}>{L.label}</span>
                              <span
                                style={{
                                  fontSize: "11px",
                                  opacity: 0.6,
                                  fontFamily: "'JetBrains Mono',monospace",
                                }}
                              >
                                {L.slots + (L.slots > 1 ? " shots" : " shot")}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div style={labelStyle}>Countdown</div>
                      <div style={{ display: "flex", gap: "7px" }}>
                        {[3, 5, 10].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => this.setState({ countdown: n })}
                            style={s.countdown === n ? merge(pillBase, pillAct) : pillBase}
                          >
                            {n + "s"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() =>
                          this.setState((st) => ({
                            facing: st.facing === "user" ? "environment" : "user",
                          }))
                        }
                        style={secondaryStyle}
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17 4l3 3-3 3" />
                          <path d="M20 7H9a5 5 0 0 0-5 5" />
                          <path d="M7 20l-3-3 3-3" />
                          <path d="M4 17h11a5 5 0 0 0 5-5" />
                        </svg>
                        Flip
                      </button>
                      <button
                        type="button"
                        onClick={() => this.setState((st) => ({ soundOn: !st.soundOn }))}
                        style={soundStyle}
                      >
                        {s.soundOn ? "Sound on" : "Sound off"}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => this.runSequence()}
                      disabled={startDisabled}
                      style={startBtnStyle}
                    >
                      {s.streamReady
                        ? "Start — " + slots + (slots > 1 ? " shots" : " shot")
                        : "Waiting for camera…"}
                    </button>
                  </div>
                )}

                {capturing && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 600, fontSize: "24px" }}>
                      {s.count > 0 ? "Get ready…" : "Smile!"}
                    </div>
                    <div style={{ color: MUTED, fontSize: "14px", lineHeight: 1.5 }}>
                      Look at the camera and hold still — {progressText}.
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                      {Array.from({ length: slots }).map((_, i) => (
                        <span
                          key={i}
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            background: i < s.heroCount ? ACC : "rgba(46,42,38,0.16)",
                            transition: "all 200ms ease",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {review && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontWeight: 600, fontSize: "20px" }}>
                      Looking good!
                    </div>
                    <div>
                      <div style={labelStyle}>Filter</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                        {FILTERS.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => this.setState({ filterId: f.id })}
                            style={s.filterId === f.id ? merge(pillBase, pillAct) : pillBase}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={labelStyle}>Frame colour</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "9px", alignItems: "center" }}>
                        {FRAMES.map((f) => {
                          const act = s.frameColor === f.hex;
                          return (
                            <button
                              key={f.hex}
                              type="button"
                              title={f.name}
                              onClick={() => this.setState({ frameColor: f.hex })}
                              style={merge(swBase, {
                                background: f.hex,
                                boxShadow: act ? "0 0 0 2px #fff, 0 0 0 4px " + ACC : "none",
                                transform: act ? "scale(1.05)" : "none",
                              })}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div style={labelStyle}>Frame theme</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                        {THEMES.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              this.setState({
                                theme: t.id,
                                ...(t.frame ? { frameColor: t.frame } : {}),
                              })
                            }
                            style={s.theme === t.id ? merge(pillBase, pillAct) : pillBase}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={labelStyle}>Border</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                        {BORDERS.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => this.setState({ borderStyle: b.id })}
                            style={s.borderStyle === b.id ? merge(pillBase, pillAct) : pillBase}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => this.setState((st) => ({ dateStamp: !st.dateStamp }))}
                      style={dateToggleStyle}
                    >
                      <span style={dateBoxStyle}>{s.dateStamp ? "✓" : ""}</span>
                      Date stamp
                    </button>

                    <div style={{ height: "1px", background: LINE, margin: "2px 0" }} />

                    <button
                      type="button"
                      onClick={() => {
                        if (s.stripUrl) this.download(s.stripUrl, "photostrip.png");
                      }}
                      style={startBtnStyle}
                    >
                      Download photo (PNG)
                    </button>

                    {!s.gifUrl && (
                      <button
                        type="button"
                        onClick={() => this.genGif()}
                        disabled={s.gifBusy}
                        style={gifBtnStyle}
                      >
                        {s.gifBusy ? "Stitching flipbook…" : "Make flipbook GIF"}
                      </button>
                    )}

                    {!!s.gifUrl && (
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          alignItems: "flex-start",
                          padding: "11px",
                          borderRadius: "13px",
                          background: GLASS_SOFT,
                          border: "1px solid " + LINE,
                        }}
                      >
                        <img
                          src={s.gifUrl}
                          alt="flipbook"
                          style={{
                            width: "96px",
                            borderRadius: "8px",
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: "#000",
                          }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: "7px", flex: 1 }}>
                          <div
                            style={{
                              fontFamily: "'JetBrains Mono',monospace",
                              fontSize: "10px",
                              letterSpacing: "1px",
                              textTransform: "uppercase",
                              color: MUTED,
                            }}
                          >
                            Flipbook ✦ stop-motion
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (s.gifUrl) this.download(s.gifUrl, "flipbook.gif");
                            }}
                            style={secondaryStyle}
                          >
                            Download GIF
                          </button>
                        </div>
                      </div>
                    )}

                    {s.gifError && (
                      <div style={{ fontSize: "12.5px", color: "#A8694C" }}>
                        Couldn't build the flipbook — please try again.
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (this._gifUrl) {
                          URL.revokeObjectURL(this._gifUrl);
                          this._gifUrl = null;
                        }
                        this.setState({
                          stage: "camera",
                          count: 0,
                          stripUrl: null,
                          gifUrl: null,
                          gifError: false,
                          heroCount: 0,
                        });
                      }}
                      style={ghostStyle}
                    >
                      Retake
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
