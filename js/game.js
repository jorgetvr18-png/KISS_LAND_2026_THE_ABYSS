"use strict";

const NIVELES = [
  {
    nombre: "La trilogía",
    tiempo: 30,          
    meta: 60,            
    aparece: 1800,       
    vida: 5000,          
    maximo: 3,           
    albumes: [
      { img: "img-hob", archivo: "img/house-of-balloons.jpg", nombre: "House of Balloons", pts: 10, peso: 4 },
      { img: "img-thu", archivo: "img/thursday.jpg",          nombre: "Thursday",          pts: 10, peso: 4 },
      { img: "img-eos", archivo: "img/echoes-of-silence.jpg",  nombre: "Echoes of Silence", pts: 20, peso: 2 }
    ]
  },
  {
    nombre: "Starboy y compañía",
    tiempo: 45, meta: 100, aparece: 1500, vida: 4200, maximo: 4,
    albumes: [
      { img: "img-sta", archivo: "img/starboy.jpg",           nombre: "Starboy",              pts: 10, peso: 4 },
      { img: "img-mdm", archivo: "img/my-dear-melancholy.jpg", nombre: "My Dear Melancholy,", pts: 10, peso: 4 },
      { img: "img-aft", archivo: "img/after-hours.jpg",        nombre: "After Hours",         pts: 20, peso: 2 }
    ]
  },
  {
    nombre: "Era moderna",
    tiempo: 60, meta: 150, aparece: 1200, vida: 3600, maximo: 5,
    albumes: [
      { img: "img-dfm", archivo: "img/dawn-fm.jpg",           nombre: "Dawn FM",             pts: 10, peso: 4 },
      { img: "img-idl", archivo: "img/the-idol.jpg",          nombre: "The Idol",            pts: 10, peso: 4 },
      { img: "img-hut", archivo: "img/hurry-up-tomorrow.jpg", nombre: "Hurry Up Tomorrow",   pts: 20, peso: 2 }
    ]
  }
];

const VELOCIDAD = 0.95;       
const LIMITE = 0.85;          
const RADIO_CAPTURA = 0.32;   
const PENALIZACION = 5;       


const $ = id => document.getElementById(id);
const THREE = window.AFRAME ? AFRAME.THREE : null;
const marcador = $("marcador");
const jugadorEl = $("jugador");
const aroJugador = $("aroJugador");

let nivel = 0, puntos = 0, total = 0;
let tiempoRestante = 0, juegoMs = 0, proximo = 0;
let activa = false, hayMarcador = false;
const jugador = { x: 0, z: 0 };
const activos = [];                   

function leerRecord() { try { return parseInt(localStorage.getItem("arquest_record")) || 0; } catch (e) { return 0; } }
function guardarRecord(v) {
  if (v > leerRecord()) { try { localStorage.setItem("arquest_record", v); } catch (e) {} }
  $("record").textContent = leerRecord();
}


let audio = null;
function sonido(freq, dur = 0.15, tipo = "sine") {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = tipo; o.frequency.value = freq; g.gain.value = 0.15;
    o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + dur);
  } catch (e) {}
}


const joy = { x: 0, y: 0 };                                  
const cruz = { izq: false, der: false, arr: false, abj: false }; 
const tec  = { izq: false, der: false, arr: false, abj: false }; 


const base = $("joystick"), palanca = $("palanca");
let joyActivo = false;
function moverPalanca(e) {
  const r = base.getBoundingClientRect();
  const lim = r.width / 2 - 12;
  let dx = e.clientX - (r.left + r.width / 2);
  let dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy);
  if (d > lim) { dx *= lim / d; dy *= lim / d; }
  palanca.style.transform = `translate(${dx}px, ${dy}px)`;
  joy.x = dx / lim;
  joy.y = -dy / lim;
}
function soltarPalanca() { joyActivo = false; joy.x = joy.y = 0; palanca.style.transform = "translate(0, 0)"; }
base.addEventListener("pointerdown", e => { joyActivo = true; base.setPointerCapture(e.pointerId); moverPalanca(e); });
base.addEventListener("pointermove", e => { if (joyActivo) moverPalanca(e); });
base.addEventListener("pointerup", soltarPalanca);
base.addEventListener("pointercancel", soltarPalanca);


const MAPA_DIR = { up: "arr", down: "abj", left: "izq", right: "der" };
document.querySelectorAll("#cruceta button").forEach(b => {
  const dir = MAPA_DIR[b.dataset.dir];
  const poner = v => e => { e.preventDefault(); cruz[dir] = v; b.classList.toggle("activo", v); };
  b.addEventListener("pointerdown", poner(true));
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, poner(false)));
});


const MAPA_TECLAS = { ArrowUp: "arr", w: "arr", ArrowDown: "abj", s: "abj", ArrowLeft: "izq", a: "izq", ArrowRight: "der", d: "der" };
window.addEventListener("keydown", e => { const k = MAPA_TECLAS[e.key]; if (k) { tec[k] = true; e.preventDefault(); } });
window.addEventListener("keyup",   e => { const k = MAPA_TECLAS[e.key]; if (k) tec[k] = false; });

const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
function vectorEntrada() {
  const sx = limitar(joy.x + ((cruz.der || tec.der) ? 1 : 0) - ((cruz.izq || tec.izq) ? 1 : 0), -1, 1);
  const sy = limitar(joy.y + ((cruz.arr || tec.arr) ? 1 : 0) - ((cruz.abj || tec.abj) ? 1 : 0), -1, 1);
  return { sx, sy };
}


function direccionEnMarcador(sx, sy) {
  const largo = Math.hypot(sx, sy);
  if (largo < 0.001) return { x: 0, z: 0 };
  try {
    const cam = document.querySelector("[camera]").object3D;
    const rel = new THREE.Matrix4().copy(cam.matrixWorld).invert().multiply(marcador.object3D.matrixWorld);
    const m = new THREE.Matrix4().extractRotation(rel);
    const ex = new THREE.Vector3(1, 0, 0).applyMatrix4(m);   // eje X del marcador visto desde la cámara
    const ez = new THREE.Vector3(0, 0, 1).applyMatrix4(m);   // eje Z del marcador visto desde la cámara
    const det = ex.x * ez.y - ez.x * ex.y;
    if (Math.abs(det) > 0.08) {
      const mx = (ez.y * sx - ez.x * sy) / det;
      const mz = (-ex.y * sx + ex.x * sy) / det;
      const l = Math.hypot(mx, mz);
      if (l > 0.0001) return { x: mx / l * largo, z: mz / l * largo };
    }
  } catch (e) {}
  return { x: sx, z: -sy };    
}

function moverJugador(dt) {
  const { sx, sy } = vectorEntrada();
  const v = direccionEnMarcador(sx, sy);
  jugador.x = limitar(jugador.x + v.x * VELOCIDAD * dt, -LIMITE, LIMITE);
  jugador.z = limitar(jugador.z + v.z * VELOCIDAD * dt, -LIMITE, LIMITE);
  if (jugadorEl.object3D) {
    jugadorEl.object3D.position.set(jugador.x, 0.32, jugador.z);
    aroJugador.object3D.position.set(jugador.x, 0.012, jugador.z);
  }
}


function nuevo(tag, attrs) {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function elegirAlbum(lista) {
  const suma = lista.reduce((s, a) => s + a.peso, 0);
  let r = Math.random() * suma;
  for (const a of lista) { r -= a.peso; if (r <= 0) return a; }
  return lista[0];
}

function posicionLibre() {
  let p;
  for (let i = 0; i < 15; i++) {
    p = { x: Math.random() * 1.6 - 0.8, z: Math.random() * 1.6 - 0.8, y: 0.35 + Math.random() * 0.3 };
    const lejosDelJugador = Math.hypot(p.x - jugador.x, p.z - jugador.z) > 0.5;
    const lejosDeOtros = activos.every(o => Math.hypot(p.x - o.x, p.z - o.z) > 0.4);
    if (lejosDelJugador && lejosDeOtros) break;
  }
  return p;
}

function aparecerAlbum() {
  const cfg = NIVELES[nivel];
  if (activos.length >= cfg.maximo) return;
  const album = elegirAlbum(cfg.albumes);
  const p = posicionLibre();

  const grupo = nuevo("a-entity", { position: `${p.x} 0 ${p.z}` });
 
  grupo.appendChild(nuevo("a-ring", {
    rotation: "-90 0 0", position: "0 0.015 0", "radius-inner": 0.24, "radius-outer": 0.29,
    material: "color: #3dffb0; shader: flat",
    animation__vida: `property: scale; from: 1 1 1; to: 0.15 0.15 0.15; dur: ${cfg.vida}; easing: linear`
  }));
  const tarjeta = nuevo("a-entity", {
    position: `0 ${p.y} 0`,
    animation__vaiven: "property: rotation; from: 0 -20 0; to: 0 20 0; dir: alternate; loop: true; dur: 1800; easing: easeInOutSine",
    animation__flota: `property: position; to: 0 ${p.y + 0.09} 0; dir: alternate; loop: true; dur: 1100; easing: easeInOutSine`
  });
  const inclinado = nuevo("a-entity", { rotation: "-35 0 0" });
  inclinado.appendChild(nuevo("a-plane", { width: 0.5, height: 0.5, position: "0 0 -0.004", material: "shader: flat; color: #3dffb0; side: double" }));
  inclinado.appendChild(nuevo("a-plane", { width: 0.42, height: 0.42, material: `shader: flat; src: #${album.img}; side: double` }));
  tarjeta.appendChild(inclinado);
  grupo.appendChild(tarjeta);
  marcador.appendChild(grupo);

  activos.push({ el: grupo, x: p.x, y: p.y, z: p.z, album, vence: juegoMs + cfg.vida });
}

function quitar(o) {
  o.el.remove();
  const i = activos.indexOf(o);
  if (i >= 0) activos.splice(i, 1);
}

function popup(texto, color, o) {
  const t = nuevo("a-text", {
    value: texto, color, align: "center", width: 2.6, rotation: "-35 0 0",
    position: `${o.x} ${o.y + 0.3} ${o.z}`,
    animation: `property: position; to: ${o.x} ${o.y + 0.95} ${o.z}; dur: 700; easing: easeOutQuad`
  });
  marcador.appendChild(t);
  setTimeout(() => t.remove(), 750);
}

function atrapar(o) {                      
  puntos += o.album.pts;
  sonido(o.album.pts > 10 ? 1040 : 880, 0.15);
  popup("+" + o.album.pts, "#3dffb0", o);
  quitar(o);
  if (puntos >= NIVELES[nivel].meta) ganarNivel();
}

function escaparse(o) {                    
  puntos = Math.max(0, puntos - PENALIZACION);
  sonido(150, 0.3, "sawtooth");
  popup("-" + PENALIZACION, "#ff2a55", o);
  quitar(o);
}

function revisarAlbumes() {
  for (const o of [...activos]) {
    if (!activa) return;
    if (Math.hypot(o.x - jugador.x, o.z - jugador.z) < RADIO_CAPTURA) atrapar(o);
    else if (juegoMs >= o.vence) escaparse(o);
  }
}

function mostrarPantalla(o) {
  $("pantalla").className = o.clase || "";
  $("logoGrande").style.display = o.logo === false ? "none" : "block";
  $("titulo").textContent = o.titulo;
  $("kana").textContent = o.kana || "";
  $("kana").style.display = o.kana ? "block" : "none";
  $("texto").textContent = o.texto || "";
  const ley = $("leyenda");
  ley.innerHTML = "";
  (o.albumes || []).forEach(a => {
    const d = document.createElement("div");
    d.innerHTML = `<img src="${a.archivo}" alt="${a.nombre}">+${a.pts}`;
    ley.appendChild(d);
  });
  $("boton").textContent = o.boton;
  $("boton").onclick = () => { sonido(660, 0.1); o.accion(); };
}

function mostrarIntro(n, mensaje) {
  const cfg = NIVELES[n];
  const datos = `${cfg.nombre} · ${cfg.tiempo} s · Meta ${cfg.meta} pts`;
  if (n === 0) {
    mostrarPantalla({
      titulo: "AR QUEST", kana: "キッスランド",
      texto: "Mueve el LOGO con el joystick o la cruceta y atrapa los álbumes de The Weeknd.\nSi se te escapan, pierdes " + PENALIZACION + " puntos.\n\nNIVEL 1 · " + datos,
      albumes: cfg.albumes, boton: "JUGAR", accion: () => iniciarNivel(0)
    });
  } else {
    mostrarPantalla({
      titulo: "NIVEL " + (n + 1), kana: "ステージ " + (n + 1),
      texto: mensaje + "\n" + datos, albumes: cfg.albumes, boton: "JUGAR", accion: () => iniciarNivel(n)
    });
  }
}


function iniciarNivel(n) {
  activos.slice().forEach(quitar);
  nivel = n; puntos = 0; juegoMs = 0; proximo = 0;
  tiempoRestante = NIVELES[n].tiempo;
  jugador.x = 0; jugador.z = 0;
  activa = true;
  $("pantalla").classList.add("oculta");
}

function ganarNivel() {
  activa = false;
  total += puntos + Math.ceil(tiempoRestante) * 2;      
  activos.slice().forEach(quitar);
  sonido(1100, 0.4);
  if (nivel < NIVELES.length - 1) {
    mostrarIntro(nivel + 1, "¡Nivel " + (nivel + 1) + " superado!\nPuntaje acumulado: " + total);
  } else {
    guardarRecord(total);
    sonido(1500, 0.6);
    mostrarPantalla({
      clase: "winner", titulo: "WINNER", kana: "ウィナー",
      texto: "¡Completaste los 3 niveles!\nPuntaje final: " + total + "\nRécord: " + leerRecord(),
      boton: "JUGAR DE NUEVO", accion: reiniciarTodo
    });
  }
}

function perder() {
  activa = false;
  guardarRecord(total + puntos);
  activos.slice().forEach(quitar);
  sonido(120, 0.6, "square");
  mostrarPantalla({
    clase: "gameover", titulo: "GAME OVER", kana: "ゲームオーバー",
    texto: "Nivel " + (nivel + 1) + " · Puntos: " + (total + puntos) + "\nRécord: " + leerRecord(),
    boton: "JUGAR DE NUEVO", accion: reiniciarTodo
  });
}

function reiniciarTodo() { total = 0; tiempoRestante = 0; activa = false; activos.slice().forEach(quitar); nivel = 0; puntos = 0; mostrarIntro(0); actualizarHud(); }


function actualizarHud() {
  const cfg = NIVELES[nivel];
  $("nivel").textContent = nivel + 1;
  $("meta").textContent = cfg.meta;
  $("puntos").textContent = puntos;
  $("tiempo").textContent = Math.max(0, Math.ceil(tiempoRestante || cfg.tiempo));
  $("progreso").style.width = Math.min(100, puntos / cfg.meta * 100) + "%";
  $("cajaTiempo").classList.toggle("alerta", activa && tiempoRestante <= 10);
}

let ultimo = performance.now();
function bucle(ahora) {
  const dt = Math.min(0.05, (ahora - ultimo) / 1000);
  ultimo = ahora;

  if (activa) moverJugador(dt);
  if (activa && hayMarcador) {                          
    juegoMs += dt * 1000;
    tiempoRestante -= dt;
    if (juegoMs >= proximo) { aparecerAlbum(); proximo = juegoMs + NIVELES[nivel].aparece; }
    revisarAlbumes();
    if (activa && tiempoRestante <= 0) perder();
  }
  actualizarHud();
  requestAnimationFrame(bucle);
}


marcador.addEventListener("markerFound", () => { hayMarcador = true;  $("estado").classList.add("oculto"); });
marcador.addEventListener("markerLost",  () => { hayMarcador = false; $("estado").classList.remove("oculto"); });
$("reiniciar").addEventListener("click", reiniciarTodo);

$("record").textContent = leerRecord();
mostrarIntro(0);
actualizarHud();
requestAnimationFrame(bucle);
