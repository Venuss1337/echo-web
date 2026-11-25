import './style.css';
import './wait.css';
import { within } from './wait';

const root = document.documentElement;
// The film is a separate download. Visitors who get the prints never use it.
if (root.classList.contains('live')) {
  import('./stage')
    .then(({ film }) => film())
    .catch((e) => {
      root.className = 'still';
      if (import.meta.env.DEV) console.error(e);
    });
  // The first screen's type is cut in as soon as it can be set in its own face.
  const faces = [document.fonts.load('500 40px "Stack Sans Notch Variable"'), document.fonts.load('400 16px "Stack Sans Text Variable"')];
  void within(2500, Promise.all(faces)).then(() => {
    if (!root.classList.contains('live')) return;
    root.classList.add('typed');
    if (scrollY > innerHeight * 0.3 || location.hash.length > 1) return;
    document.querySelectorAll('#cover .pin').forEach((e) => e.classList.add('on'));
    document.querySelectorAll('#cover .cut').forEach((e) => e.classList.add('in'));
  });
}
