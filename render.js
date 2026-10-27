// Offline path-traced 360° panoramas of the tour scene (open index.html?render=1).
// Driven from the console: RT.preview('living'), RT.pano('living', {samples: 600}), RT.all({...}).
import { WebGLPathTracer, EquirectCamera } from 'three-gpu-pathtracer';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export async function init(ctx){
  const { THREE, scene, renderer, camera, m, LR, setLight, setMode, updateLights, sky, blocked, current } = ctx;
  renderer.setAnimationLoop(null);
  document.querySelectorAll('body > *:not(canvas):not(script)').forEach(e => { if (e.id !== 'c') e.style.display = 'none'; });
  const cv = renderer.domElement;
  Object.assign(cv.style, {position: 'fixed', inset: '0', width: '100vw', height: '100vh', objectFit: 'contain', background: '#000'});
  const log = document.createElement('div');
  Object.assign(log.style, {position: 'fixed', left: '8px', top: '8px', color: '#fff', font: '12px monospace', zIndex: 9, background: 'rgba(0,0,0,.6)', padding: '4px 8px'});
  document.body.appendChild(log); log.style.display = 'block';

  // 70 m² capture points, plan px (168 px = 1 m); yaw = initial heading for the viewer
  const P = {
    hall:     {n: 'Hall do elevador',   x: 1800, z: 1395, room: 'Hall de entrada', yaw: Math.PI/2},
    living:   {n: 'Living',             x: 1340, z: 1160, room: 'Living', yaw: 2.6},
    cozinha:  {n: 'Cozinha',            x: 1230, z: 1460, room: 'Gourmet e jantar', yaw: Math.PI/2},
    jantar:   {n: 'Jantar e gourmet',   x: 900,  z: 1470, room: 'Gourmet e jantar', yaw: -Math.PI/2},
    varanda:  {n: 'Gourmet · janelas',  x: 400,  z: 1210, room: 'Gourmet e jantar', yaw: 0},
    servico:  {n: 'Área de serviço',    x: 640,  z: 1085, room: 'Área de serviço', yaw: 0},
    circ:     {n: 'Circulação',         x: 1100, z: 760,  room: 'Circulação', yaw: 0},
    suite:    {n: 'Suíte',              x: 760,  z: 590,  room: 'Suíte', yaw: .35},
    banhoS:   {n: 'Banho da suíte',     x: 430,  z: 790,  room: 'Banho suíte', yaw: 0},
    quarto:   {n: 'Quarto',             x: 1290, z: 610,  room: 'Quarto', yaw: -.2},
    banho:    {n: 'Banho social',       x: 1100, z: 470,  room: 'Banho social', yaw: 0},
  };
  const CAM_Y = 1.45;

  // ---- make the raster scene path-tracer friendly ----
  setLight(ctx.light || 'manha'); setMode('walk');
  LR.forEach(r => { r.on = true; r.v = 1; }); for (let i = 0; i < 30; i++) updateLights(.1);
  sky.visible = false; scene.fog = null; if (ctx.doorG) ctx.doorG.rotation.y = -1.45;
  // the tracer assigns one material per mesh: split multi-material meshes (walls/ceilings) into one mesh per group
  { const multi = []; scene.traverse(o => { if (o.isMesh && Array.isArray(o.material)) multi.push(o); });
    for (const o of multi) {
      const g0 = o.geometry.index ? o.geometry : null; if (!g0) { o.material = o.material[0]; continue; }
      for (const gr of o.geometry.groups) {
        const mt = o.material[gr.materialIndex]; if (!mt || mt.visible === false) continue;
        const g = o.geometry.clone(); g.clearGroups(); g.setIndex(Array.from(o.geometry.index.array.slice(gr.start, gr.start + gr.count)));
        const part = new THREE.Mesh(g, mt); part.position.copy(o.position); part.quaternion.copy(o.quaternion); part.scale.copy(o.scale);
        part.visible = o.visible; o.parent.add(part);
      }
      o.visible = false; o.material = o.material[0];
    } }
  const swaps = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.geometry = o.geometry.clone();          // the tracer caches material ids on the geometry: never share it
    if (!Array.isArray(o.material)) o.geometry.clearGroups();   // single-material boxes/cylinders keep groups that shift the tracer's material ids
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every(mt => mt.visible === false)) { o.visible = false; return; }
    if (o.material.isShaderMaterial) { o.visible = false; return; }
    if (!Array.isArray(o.material) && o.material.isMeshBasicMaterial) {
      const b = o.material;
      if (b.transparent && b.opacity < 1) { o.visible = false; return; }
      o.material = new THREE.MeshStandardMaterial({color: 0x000000, emissive: b.color, emissiveIntensity: 1.4, emissiveMap: b.map || null, side: b.side});
    }
    if (o.isInstancedMesh) swaps.push(o);
  });
  for (const im of swaps) {
    const gs = [], mt = new THREE.Matrix4();
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, mt); const g = im.geometry.clone(); g.applyMatrix4(mt); gs.push(g); }
    if (!gs.length) { im.visible = false; continue; }
    gs.forEach(g => g.clearGroups()); const mesh = new THREE.Mesh(mergeGeometries(gs, false), im.material);
    mesh.position.copy(im.position); mesh.quaternion.copy(im.quaternion); mesh.scale.copy(im.scale);
    mesh.visible = im.visible; im.parent.add(mesh); im.visible = false;
  }
  // glass: clear transmissive panes instead of alpha
  scene.traverse(o => { if (o.isMesh && o.material && o.material.isMeshPhysicalMaterial && o.material.transparent && o.material.opacity < .3) {
    const g = o.material; if (!g.__pt) { g.__pt = true; g.transparent = false; g.opacity = 1; g.transmission = 1; g.roughness = 0; g.thickness = 0; g.ior = 1.5; g.color.set(0xf4fbfb); } } });

  // share identical materials (keeps the tracer's material ids in 8 bits and the material table small)
  { const keyOf = mt => { const o = {t: mt.type}; for (const k of ['color','emissive','specularColor','sheenColor','attenuationColor']) if (mt[k]) o[k] = mt[k].getHexString();
      for (const k of ['roughness','metalness','emissiveIntensity','opacity','transparent','transmission','ior','thickness','clearcoat','clearcoatRoughness','sheen','side','alphaTest','flatShading','vertexColors']) o[k] = mt[k];
      for (const k of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','alphaMap','bumpMap','aoMap']) o[k] = mt[k] ? mt[k].uuid + (mt[k].repeat ? mt[k].repeat.x + ',' + mt[k].repeat.y + ',' + mt[k].offset.x + ',' + mt[k].offset.y + ',' + mt[k].rotation : '') : null;
      return JSON.stringify(o); };
    const pool = new Map(), f = mt => { const k = keyOf(mt); if (!pool.has(k)) pool.set(k, mt); return pool.get(k); };
    scene.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material); });
    console.log('materials', pool.size); }
  // sky: equirect gradient + soft sun glow (linear floats)
  function skyTex(key){
    const K = ctx.SKY[key], W = 512, Hh = 256, d = new Float32Array(W*Hh*4);
    const top = new THREE.Color(K.top), hor = new THREE.Color(K.hor), bot = new THREE.Color(K.bot), sc = new THREE.Color(K.sunCol);
    const L = ctx.LIGHTS[key], sd = new THREE.Vector3(...L.sun).normalize(), v = new THREE.Vector3(), c = new THREE.Color();
    const gain = ctx.skyGain ?? 1.6;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const th = (y + .5)/Hh*Math.PI, ph = (x + .5)/W*Math.PI*2;
      v.set(Math.sin(th)*Math.cos(ph), Math.cos(th), Math.sin(th)*Math.sin(ph));
      const e = v.y;
      if (e >= 0) c.copy(hor).lerp(top, Math.pow(e, .55)); else c.copy(hor).lerp(bot, Math.min(1, -e*4));
      const s = Math.max(0, v.dot(sd)); c.r += sc.r*Math.pow(s, 24)*.8; c.g += sc.g*Math.pow(s, 24)*.8; c.b += sc.b*Math.pow(s, 24)*.8;
      const i = ((Hh - 1 - y)*W + x)*4; d[i] = c.r*gain; d[i+1] = c.g*gain; d[i+2] = c.b*gain; d[i+3] = 1;
    }
    const t = new THREE.DataTexture(d, W, Hh, THREE.RGBAFormat, THREE.FloatType);
    t.mapping = THREE.EquirectangularReflectionMapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
  }
  const env = skyTex(ctx.light || 'manha'); scene.environment = env; scene.background = env;

  // three r160 lacks these (added in r162); the path tracer reads them
  for (const k of ['backgroundRotation', 'environmentRotation']) if (!(k in THREE.Scene.prototype)) THREE.Scene.prototype[k] = new THREE.Euler();
  const pt = new WebGLPathTracer(renderer);
  pt.renderDelay = 0; pt.fadeDuration = 0; pt.minSamples = 0; pt.dynamicLowRes = false; pt.rasterizeScene = false;
  pt.bounces = 5; pt.transmissiveBounces = 4; pt.filterGlossyFactor = .5; pt.textureSize.set(2048, 2048);
  pt.tiles.set(2, 2);
  const persp = new THREE.PerspectiveCamera(75, 1, .05, 800), eq = new EquirectCamera();
  log.textContent = 'building BVH…'; const frame0 = () => new Promise(r => setTimeout(r, 50));
  await frame0(); pt.setScene(scene, persp);
  log.textContent = 'ready';

  // MessageChannel yields keep running when the pane is in the background (rAF is throttled there)
  const frame = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  const gl = renderer.getContext(), px = new Uint8Array(4);
  const pos = p => new THREE.Vector3(m(p.x), CAM_Y, m(p.z));
  let stop = false;
  async function accumulate(n){
    stop = false; const t0 = performance.now();
    while (pt.samples < n && !stop) { for (let i = 0; i < 4; i++) pt.renderSample(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); RT.prog = Math.floor(pt.samples) + '/' + n; log.textContent = `${Math.floor(pt.samples)}/${n} · ${((performance.now()-t0)/1000).toFixed(0)}s`; await frame(); }
    pt.renderSample();
    return (performance.now() - t0)/1000;
  }
  function setSize(w, h){ renderer.setPixelRatio(1); renderer.setSize(w, h, false); }
  function save(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  const grab = (type = 'image/png', q) => new Promise(r => { pt.renderSample(); cv.toBlob(r, type, q); });
  const RT = window.RT = {
    P, pt, scene, THREE,
    stop(){ stop = true; },
    async snap(name){ const b = await grab('image/jpeg', .92); save(b, name); return b.size; },
    exposure(v){ renderer.toneMappingExposure = v; pt.reset(); },
    async preview(k, {yaw, pitch = 0, w = 1200, h = 800, samples = 64, fov = 75} = {}){
      const p = P[k]; setSize(w, h); persp.aspect = w/h; persp.fov = fov; persp.updateProjectionMatrix();
      persp.position.copy(pos(p)); persp.rotation.set(pitch, yaw ?? p.yaw, 0, 'YXZ'); pt.setCamera(persp);
      return accumulate(samples);
    },
    async pano(k, {w = 4096, samples = 512, download = true, q = .9} = {}){
      const p = P[k]; setSize(w, w/2); eq.position.copy(pos(p)); eq.rotation.set(0, 0, 0); pt.setCamera(eq);
      const s = await accumulate(samples);
      const blob = await grab('image/png');
      if (download) save(blob, `pano-${k}.png`);
      return {k, s: Math.round(s), size: blob.size};
    },
    // denoiser guides: albedo + world normals, same equirect mapping as the tracer (raw linear values in the PNG)
    async aux(k, {w = 4096, download = true} = {}){
      const p = P[k], cubeRT = new THREE.WebGLCubeRenderTarget(2048, {type: THREE.HalfFloatType}), cc = new THREE.CubeCamera(.03, 900, cubeRT);
      cc.position.copy(pos(p)); scene.add(cc);
      const nrm = new THREE.ShaderMaterial({side: THREE.DoubleSide, vertexShader: 'varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: 'varying vec3 vN; void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; gl_FragColor = vec4(n * .5 + .5, 1.); }'});
      const albCache = new Map(), alb = mt => { if (!albCache.has(mt)) { const em = mt.emissive && mt.emissiveIntensity > 0 && (mt.emissive.r + mt.emissive.g + mt.emissive.b) > 0;
        const c = mt.color ? mt.color.clone() : new THREE.Color(1, 1, 1); if (em && c.r + c.g + c.b < .05) c.copy(mt.emissive);
        albCache.set(mt, new THREE.MeshBasicMaterial({color: c, map: mt.map || (em ? mt.emissiveMap : null) || null, side: mt.side, transparent: mt.transparent, opacity: mt.opacity, alphaMap: mt.alphaMap || null, alphaTest: mt.alphaTest})); }
        return albCache.get(mt); };
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({uniforms: {cube: {value: cubeRT.texture}}, depthTest: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
        fragmentShader: 'uniform samplerCube cube; varying vec2 vUv; void main(){ vec2 uv = vUv; uv.x -= .5; uv.y = 1. - uv.y; float th = uv.x * 6.2831853, ph = uv.y * 3.14159265; vec3 d = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)); gl_FragColor = vec4(textureCube(cube, vec3(-d.x, d.y, d.z)).rgb, 1.); }'}));
      const qs = new THREE.Scene(); qs.add(quad); const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const out = [];
      for (const mode of ['alb', 'nrm']) {
        const saved = []; scene.traverseVisible(o => { if (!o.isMesh || o === quad) return; saved.push([o, o.material]);
          if (o.material.transmission > .5) { o.visible = false; return; } o.material = mode === 'alb' ? alb(o.material) : nrm; });
        const bg = scene.background; scene.background = mode === 'alb' ? bg : new THREE.Color(.5, .5, .5);
        const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
        cc.update(renderer, scene);
        saved.forEach(([o, mt]) => { o.material = mt; o.visible = true; }); scene.background = bg;
        setSize(w, w/2); renderer.setRenderTarget(null);
        const blob = await new Promise(r => { renderer.render(qs, qc); cv.toBlob(r, 'image/png'); });
        renderer.toneMapping = tm;
        if (download) save(blob, `pano-${k}-${mode}.png`); out.push(blob.size);
      }
      scene.remove(cc); cubeRT.dispose(); pt.reset(); return out;
    },
    async all(opts = {}, keys = Object.keys(P)){ const out = []; for (const k of keys) { if (stop) break; out.push(await RT.pano(k, opts)); } RT.done = out; return out; },
    // which points can see each other (for hotspot links)
    links(maxD = 7){
      const ray = new THREE.Raycaster(), meshes = []; scene.traverseVisible(o => { if (o.isMesh && !(o.material.transmission > .5)) meshes.push(o); });
      const out = {};
      for (const a in P) { out[a] = []; for (const b in P) { if (a === b) continue;
        const A = pos(P[a]), Bv = pos(P[b]); A.y = Bv.y = 1.0; const d = A.distanceTo(Bv); if (d > maxD) continue;
        ray.set(A, Bv.clone().sub(A).normalize()); ray.far = d - .15; const hit = ray.intersectObjects(meshes, false)[0];
        if (!hit) out[a].push(b); } }
      return out;
    },
    free(){ return Object.fromEntries(Object.entries(P).map(([k, p]) => [k, !blocked(m(p.x), m(p.z))])); },
  };
  log.textContent = 'ready · RT.preview(k) / RT.pano(k)';
}
