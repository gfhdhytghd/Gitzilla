import {registerRoot, Composition} from 'remotion';
import {Pitch} from './Pitch';
import {FILM} from './film';
import {FPS, W, H} from './theme';

const Root = () => (
  <Composition id="Pitch" component={Pitch} durationInFrames={Math.round(FILM.length * FPS)} fps={FPS} width={W} height={H} />
);

registerRoot(Root);
