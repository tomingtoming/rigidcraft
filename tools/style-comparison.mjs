import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = process.argv[2];
if (!output) throw Error('Pass a screenshot output directory');
await mkdir(output, { recursive: true });
const server = await createServer({server:{host:'127.0.0.1',port:0,strictPort:true}});
await server.listen();
const browser = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:1180,height:650}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type()==='error') errors.push(msg.text()); });
  const address=server.httpServer.address();
  if(!address || typeof address==='string')throw Error('Missing preview port');
  await page.goto('http://127.0.0.1:'+address.port+'/#plane');
  await page.waitForFunction(()=>window.__sim?.env('ASSIST')===1);
  await page.click('#build');
  await page.waitForFunction(()=>window.__scene.views.size>20);
  const prepare = () => page.evaluate(async()=>{
    const moduleUrl='/node_modules/three/build/three.module.js';
    /** @type {typeof import('three')} */
    const THREE=await import(moduleUrl);
    const scene = window.__scene;
    const views = [...scene.views.values()];
    const editing=document.body.classList.contains('building');
    if(editing){scene.selectTile(0);scene.zoomBy(0.67,true);}
    const tile=document.createElement('canvas');tile.width=tile.height=128;
    const pen=tile.getContext('2d');pen.fillStyle='#f1f7fa';pen.fillRect(0,0,128,128);
    pen.fillStyle='#739ab5';pen.fillRect(0,0,3,128);pen.fillRect(0,0,128,3);
    const graph=new THREE.CanvasTexture(tile);
    graph.colorSpace=THREE.SRGBColorSpace;graph.wrapS=graph.wrapT=THREE.RepeatWrapping;
    graph.repeat.set(800,800);graph.anisotropy=8;
    const roomUrl='/node_modules/three/examples/jsm/environments/RoomEnvironment.js';
    const { RoomEnvironment }=await import(roomUrl);
    const studio=new RoomEnvironment();
    const generator=new THREE.PMREMGenerator(scene.renderer);
    const reflection=generator.fromScene(studio).texture;
    studio.dispose(); generator.dispose();
    const original = views.map(v=>v.material);
    const bands = new THREE.DataTexture(new Uint8Array([48,110,210,255]),4,1,THREE.RedFormat);
    bands.minFilter=bands.magFilter=THREE.NearestFilter;
    bands.needsUpdate=true;
    const edgeGeometry = new Map();
    const ink = new THREE.LineBasicMaterial({color:0x32233a});
    const edges = views.map(({mesh})=>{
      if (!edgeGeometry.has(mesh.geometry)) edgeGeometry.set(mesh.geometry,new THREE.EdgesGeometry(mesh.geometry,24));
      const outline = new THREE.LineSegments(edgeGeometry.get(mesh.geometry),ink);
      mesh.add(outline);
      return outline;
    });
    const floor = /** @type {import('three').Mesh<import('three').PlaneGeometry,import('three').MeshStandardMaterial>} */ (scene.scene.children.find(o=>o.type==='Mesh' && /** @type {import('three').Mesh} */ (o).geometry.type==='PlaneGeometry'));
    const grids = /** @type {import('three').GridHelper[]} */ (scene.scene.children.filter(o=>o.type==='GridHelper'));
    const floorColor = floor.material.color.clone();
    window.restoreFloor=()=>{floor.material.map=null;floor.material.color.copy(floorColor);floor.material.needsUpdate=true;};
    const looks = views.map((v,i)=>{
      const paint=new THREE.MeshStandardMaterial({color:original[i].color,side:original[i].side,transparent:original[i].transparent,opacity:original[i].opacity});
      paint.roughness=0.18; paint.metalness=0.58; paint.envMap=reflection; paint.envMapIntensity=1.25;
      const cel=new THREE.MeshToonMaterial({color:paint.color,gradientMap:bands});
      const paper=new THREE.MeshBasicMaterial({color:paint.color.clone().lerp(new THREE.Color(0xe9f4f7),0.72)});
      for(const m of [cel,paper]) {m.side=paint.side;m.transparent=paint.transparent;m.opacity=paint.opacity;}
      return [paint,cel,paper];
    });
    window.previewLook = mode=>{
      views.forEach((v,i)=>{v.outline.visible=false;v.mesh.material=looks[i][mode];edges[i].visible=mode!==0;});
      floor.material.map=mode===2?graph:null;floor.material.needsUpdate=true;
      ink.color.setHex(mode===2?0x17496b:0x31243b);
      floor.material.color.copy(mode===2?new THREE.Color(0xbfd5e2):mode===0?new THREE.Color(0xdbc9a8):floorColor);
      grids.forEach(g=>{g.material.opacity=mode===2?0.9:0.35;});
      scene.scene.background=new THREE.Color([0xffedd4,0xe7edf1,0xe6f0f6][mode]);
      scene.scene.fog.color.copy(scene.scene.background);
      scene.render();
    };
  });
  const pictures=[];
  for (const stage of ['build','flight']) {
    if(stage==='flight'){
      await page.click('#run');
      await page.waitForFunction(()=>window.__sim && !document.body.classList.contains('building'));
      await page.locator('#view').focus();
      await page.keyboard.press('Space');
      await page.evaluate(()=>{
        const sim=window.__sim;
        sim.evalLua('THROTTLE=60000');
        for(let f=0;f<230;f++)sim.step();
        if(sim.coreVelocity().length()<30)throw Error('Missing flight state');
        window.__scene.setView('D');
      });
    }
    await prepare();
    await page.waitForTimeout(300);
    const pose=await page.evaluate(()=>{
      const scene=window.__scene, camera=scene.camera;
      const position=camera.position.clone(), rotation=camera.quaternion.clone();
      const render=scene.render.bind(scene);
      window.releaseCamera=()=>{scene.render=render;};
      scene.render=()=>{camera.position.copy(position);camera.quaternion.copy(rotation);render();};
      scene.render();
      return camera.matrixWorld.toArray();
    });
    for (const [i,name] of ['tin','cel','paper'].entries()){
      await page.evaluate(i=>window.previewLook(i),i);
      const bytes=await page.locator('#view').screenshot({path:resolve(output,stage+'-'+name+'.png')});
      const current=await page.evaluate(()=>window.__scene.camera.matrixWorld.toArray());
      if(current.some((v,n)=>Math.abs(v-pose[n])>1e-6))throw Error('Camera moved during comparison');
      pictures.push(bytes.toString('base64'));
    }
    await page.evaluate(()=>{window.releaseCamera();window.restoreFloor();});
  }
  if(errors.length) throw Error(errors.join('\n'));
  await page.setViewportSize({width:1500,height:860});
  const labels=['塗装したブリキ玩具','輪郭線のあるセル画','方眼紙の設計図'];
  await page.setContent('<style>*{box-sizing:border-box}body{margin:0;background:#182029;color:white;font:23px sans-serif;display:grid;grid-template-columns:repeat(3,1fr)}figure{width:100%;margin:0;padding:8px}img{width:100%;height:360px;object-fit:cover}figcaption{padding:10px}</style>'+pictures.map((p,i)=>'<figure><img src="data:image/png;base64,'+p+'"><figcaption>'+(i<3?'組立 ｜ ':'飛行 ｜ ')+labels[i%3]+'</figcaption></figure>').join(''));
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
  await page.screenshot({path:resolve(output,'comparison.png')});
} finally { await browser.close(); await server.close(); }
