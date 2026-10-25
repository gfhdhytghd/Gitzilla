/// <reference types="webxr" />
/** Plumbing contract. World (x,y,height) maps to three (X,Y,Z)=(x,height,y).
 * Screen coordinates are logical viewport pixels, never CSS/device pixels. */
import type { Camera, CanvasTexture, InstancedMesh, Material, BufferGeometry, PerspectiveCamera, Vector3, WebGLRenderer } from 'three';

export interface Point2 { x: number; y: number }
export interface ProjectedPoint extends Point2 { scale: number }
export interface StageView { x: number; y: number; w: number; h: number; cssScale?: number }
export type XRScale = 'table' | 'life';
export type ImmersiveMode = 'immersive-vr' | 'immersive-ar';
export interface SpatialSupport {
  vr: boolean; ar: boolean; model: boolean; modelImmersive: boolean;
}
export interface CameraRigOptions {
  /** Initial logical viewport, NOT the WebGL canvas's CSS/backing-store size. */
  width: number; height: number; worldWidth: number; worldHeight: number;
  /** Degrees above the floor; default42. */
  pitch?: number;
  fov?: number;
  /** Use view's center/extent rather than fitting the whole arena. */
  phone?: boolean;
}
export interface CameraRig {
  camera: PerspectiveCamera;
  resize(width: number, height: number): void;
  setWorld(width: number, height: number): void;
  /** view.w/h define logical projection pixels. An existing smoothed View is
   * used directly; phone=true follows it. No view = full arena/initial viewport. */
  update(view?: StageView, dt?: number): void;
  worldToScreen(x: number, y: number, height?: number, out?: ProjectedPoint): ProjectedPoint;
  /** Ray/floor intersection. NaN coordinates indicate a parallel/behind-camera miss. */
  screenToWorld(sx: number, sy: number, out?: Point2): Point2;
}
export interface XRPlacement {
  /** Meters per logical world pixel; apply uniformly to the world root. */
  scale: number;
  position: { x: number; y: number; z: number };
}
export interface XRPlacementOptions {
  mode?: XRScale; worldWidth: number; worldHeight: number;
  tableWidth?: number; tableHeight?: number; distance?: number;
  /** Life-size defaults to a28px hero being1.7m tall. */
  metersPerPixel?: number;
  follow?: Point2 | null;
}
export interface XRSelectInfo {
  event: XRInputSourceEvent;
  inputSource: XRInputSource;
  /** Includes visionOS transient-pointer. UI callbacks only; never gameplay input. */
  transient: boolean;
  pose: XRPose | undefined;
}
export interface XROptions {
  /** Default remains VR for Vision Pro. Detect modes before the entry gesture. */
  mode?: ImmersiveMode;
  /** AR NotSupportedError only; permission/user cancellation never falls back. */
  fallbackToVR?: boolean;
  handTracking?: boolean;
  /** Approximate standing eye height when the device only provides local space. */
  fallbackViewerHeight?: number;
  onFrame?: (time: number, frame?: XRFrame) => void;
  onSelect?: (info: XRSelectInfo) => void;
  /** Granted joint data only. Pose input is UI-only and never synthesizes select. */
  onHand?: (source: XRInputSource, frame: XRFrame, space: XRReferenceSpace) => void;
  onVisibilityChange?: (state: XRVisibilityState) => void;
  onEnd?: () => void;
  /** Restore the screen animation loop when the session ends. */
  screenLoop?: ((time: number, frame?: XRFrame) => void) | null;
}
export interface XRHandle {
  mode: ImmersiveMode;
  session: XRSession;
  referenceSpace: XRReferenceSpace;
  referenceSpaceType: 'local-floor' | 'local';
  /** Reused diagnostics updated from actual XRFrame poses before onFrame. */
  debug: XRDebugState;
  exit(): Promise<void>;
}
export interface XRDebugState {
  referenceSpaceType: 'local-floor' | 'local';
  referenceOffsetY: number;
  rawHeadY: number | null;
  head: { x: number; y: number; z: number } | null;
  visionPro: boolean;
  tableHeightOffset: number;
  tableY: number | null;
}
export type XRRenderer = Pick<WebGLRenderer, 'xr' | 'setAnimationLoop'> & Partial<Pick<WebGLRenderer, 'getClearAlpha' | 'setClearAlpha'>>;
export interface TextureCache {
  /** Stable sprite key + frame signature. Same signature never marks texture dirty. */
  get(key: string, signature: string | number, source: HTMLCanvasElement): CanvasTexture;
  delete(key: string): void;
  clear(): void;
  dispose(): void;
  readonly size: number;
}
export interface InstancePool {
  mesh: InstancedMesh;
  readonly capacity: number;
  readonly count: number;
  begin(): void;
  /** Returns slot, or -1 on overflow. Euler XYZ radians; no per-call allocation. */
  add(x: number, y: number, z: number, sx?: number, sy?: number, sz?: number, rx?: number, ry?: number, rz?: number, color?: number): number;
  end(): void;
  /** Geometry/material remain caller-owned unless disposeResources=true. */
  dispose(disposeResources?: boolean): void;
}
export type InstanceGeometry = BufferGeometry;
export type InstanceMaterial = Material | Material[];
/** Reusable target for optional camera-ray helpers. */
export type ProjectionCamera = Camera;
export type ProjectionVector = Vector3;
