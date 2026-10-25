/** Sensors use the handset's standard axes, not a responsive viewport's shape.
 * iPadOS can advertise MacIntel and have a portrait-shaped Stage Manager window
 * while the physical display is landscape. Never infer rotation from innerWidth.
 */
interface NavigatorLike { userAgent?: string; platform?: string; maxTouchPoints?: number }
interface WindowLike {
  orientation?: number;
  screen?: { orientation?: { angle?: number; type?: string }; width?: number; height?: number };
  innerWidth?: number; innerHeight?: number;
  matchMedia?: (query:string)=>{matches:boolean};
}
export function isAppleTouchDevice(nav:NavigatorLike) {
  return /iPad|iPhone|iPod/.test(nav.userAgent??'') || (nav.maxTouchPoints??0)>0 && /MacIntel|Macintosh/.test(`${nav.platform} ${nav.userAgent}`);
}
export function isMotionDevice(win:WindowLike,nav:NavigatorLike) {
  return (nav.maxTouchPoints??0)>0 || !!win.matchMedia?.('(pointer: coarse)').matches;
}
const canonical=(angle:number)=>((angle%360)+360)%360;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const typeAngles:Record<string,number>={'portrait-primary':0,'landscape-primary':90,'portrait-secondary':180,'landscape-secondary':270};
export function screenOrientation(win:WindowLike,nav:NavigatorLike) {
  const modern=win.screen?.orientation;
  const windowAngle=finite(win.orientation)?canonical(win.orientation):null;
  const screenAngle=finite(modern?.angle)?canonical(modern!.angle!):null;
  const screenType=modern?.type??null;
  const apple=isAppleTouchDevice(nav);
  // Safari's legacy value is portrait-relative and agrees with its sensor axes.
  // The modern API may use a natural landscape origin on desktop-UA iPads.
  const [angle,source] = apple&&windowAngle!==null ? [windowAngle,'window.orientation'] as const
    : apple&&screenType&&screenType in typeAngles ? [typeAngles[screenType],'screen.orientation.type'] as const
    : screenAngle!==null ? [screenAngle,'screen.orientation.angle'] as const
    : windowAngle!==null ? [windowAngle,'window.orientation'] as const
    : [0,'default'] as const;
  return {angle,source,windowAngle,screenAngle,screenType,
    viewport:[win.innerWidth??0,win.innerHeight??0],display:[win.screen?.width??0,win.screen?.height??0]};
}
