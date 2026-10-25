/** IWER2.5 expects a mat4 here, while native WebXR accepts XRRigidTransform.
 * Normalize only the emulator boundary; all poses still use IWER's real math.
 * Never imported by production code or used to patch native headset sessions. */
import { XRReferenceSpace } from 'iwer';
export function installIWERReferenceSpaceCompatibility() {
  const proto = XRReferenceSpace.prototype as any;
  if (proto.__kaijuOffsetCompat) return;
  const original = proto.getOffsetReferenceSpace;
  proto.getOffsetReferenceSpace = function (offset: any) { return original.call(this, offset.matrix ?? offset); };
  Object.defineProperty(proto, '__kaijuOffsetCompat', { value: true });
}
