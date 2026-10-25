/** Opt-in diagnostics, including an in-session panel (DOM alone is hidden in VR). */
import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, Quaternion, Vector3 } from 'three';
import type { Camera, Scene } from 'three';
import type { XRDebugState } from './types';

export function createXRHeightReadout(scene: Scene) {
  const enabled = new URLSearchParams(globalThis.location?.search ?? '').get('xrdebug') === '1';
  if (!enabled) return { update(_state: XRDebugState, _camera: Camera) {}, hide() {}, dispose() {} };
  const output = document.createElement('output'); output.dataset.testid = 'xr-debug';
  output.style.cssText = 'position:fixed;right:4px;top:4px;z-index:10000;white-space:pre;background:#07151de8;color:#fff;font:11px monospace;padding:5px;pointer-events:none';
  output.textContent = 'XR: waiting for tracked pose'; document.body.append(output);
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 130;
  const ctx = canvas.getContext('2d')!, texture = new CanvasTexture(canvas);
  texture.minFilter = texture.magFilter = NearestFilter; texture.generateMipmaps = false;
  const mesh = new Mesh(new PlaneGeometry(0.48, 0.156), new MeshBasicMaterial({ map: texture, side: DoubleSide, depthTest: false, depthWrite: false }));
  mesh.name = 'xr-debug-readout';
  mesh.renderOrder = 10000; mesh.visible = false; scene.add(mesh);
  const p = new Vector3(), q = new Quaternion(); let last = -Infinity;
  const fmt = (n: number | null) => n === null ? 'pending' : `${n.toFixed(2)}m`;
  return {
    update(state: XRDebugState, camera: Camera) {
      if (!state.head) return;
      mesh.visible = true; camera.getWorldQuaternion(q);
      p.set(0, -0.3, -0.8).applyQuaternion(q).add(state.head);
      mesh.position.copy(p); mesh.quaternion.copy(q);
      if (performance.now() - last < 200) return; last = performance.now();
      const text = [`XR ${state.referenceSpaceType} | raw head ${fmt(state.rawHeadY)}`,
        `head ${fmt(state.head.y)} | ref offset ${fmt(state.referenceOffsetY)}`,
        `table ${fmt(state.tableY)} | user ${fmt(state.tableHeightOffset)}`,
        `base ${fmt(state.baseTableY ?? null)} | eye ${fmt(state.estimatedEyeHeight ?? null)}`,
        `height ${state.heightSource ?? 'pending calibration'}`];
      output.textContent = text.join('\n');
      ctx.fillStyle = '#07151d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff'; ctx.font = '15px monospace';
      for (let i = 0; i < text.length; i++) ctx.fillText(text[i], 8, 20 + i * 23);
      texture.needsUpdate = true;
    },
    hide() { mesh.visible = false; },
    dispose() { output.remove(); mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); texture.dispose(); },
  };
}
