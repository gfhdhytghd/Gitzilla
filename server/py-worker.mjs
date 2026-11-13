/* Isolation layers: Node permission model allows reads only of this worker and Pyodide;
 * the parent clears the environment, limits the Node heap and kills after 20 s.
 * Student files use only Emscripten's memory FS (never mount NODEFS).
 * Remove network globals and process after loading; captured stream callbacks retain
 * only protocol output. Python blocks JS bridge imports before importing student code.
 * Python stdout/stderr retain at most 8 KB combined; stdin is always EOF.
 */
import { constants as fsConstants } from 'node:fs';
import { loadPyodide } from '../node_modules/pyodide/pyodide.mjs';
const host = process, write = host.stdout.write.bind(host.stdout);
// Emscripten's NODEFS.staticInit reads open() flag constants through process.binding, which the permission
// model denies. Serve only those static constants; NODEFS itself is never mounted.
host.binding = name => name === 'constants' ? { fs: fsConstants } : {};
let input = '';
for await (const chunk of host.stdin) input += chunk;
const job = JSON.parse(input);
const py = await loadPyodide({ stdout: () => {}, stderr: () => {}, stdin: () => null });
py.setStdin({ stdin: () => null });
py.setStdout({ write: buffer => buffer.length }); py.setStderr({ write: buffer => buffer.length });
for (const key of ['fetch', 'WebSocket', 'XMLHttpRequest', 'process']) delete globalThis[key];
py.globals.set('_job_json', JSON.stringify(job));
py.runPython(`
import sys, os, json, io, doctest, importlib.util, importlib.abc
_job = json.loads(_job_json)
_root = '/student'
os.mkdir(_root)
os.chdir(_root)
sys.path.insert(0, _root)
for _f in _job['files']:
    _p = _f['path']
    if not _p or _p.startswith('/') or '\\\\' in _p or any(x in ('', '.', '..') for x in _p.split('/')):
        raise ValueError('invalid submission path')
    os.makedirs(os.path.dirname(_p) or '.', exist_ok=True)
    with open(_p, 'w') as _out:
        _out.write(_f['text'])
class _BlockBridge(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in ('js', 'pyodide_js', '_pyodide', 'pyodide'):
            raise ImportError('JS bridge imports are blocked')
for _name in list(sys.modules):
    if _name.split('.')[0] in ('js', 'pyodide_js', '_pyodide', 'pyodide'):
        sys.modules[_name] = None
for _name in ('js', 'pyodide_js', '_pyodide', 'pyodide'):
    sys.modules[_name] = None
sys.meta_path.insert(0, _BlockBridge())
class _Capture(io.TextIOBase):
    remaining = 8192
    overflow = 0
    def write(self, value):
        raw = value.encode('utf-8')
        data = raw[:_Capture.remaining]
        _Capture.remaining -= len(data)
        _Capture.overflow += len(raw) - len(data)
        return len(value)
    def flush(self): pass
sys.stdout = sys.stderr = _Capture()
sys.stdin = io.StringIO('')
class _BoundedOutput(io.StringIO):
    def truncate(self, size=0):
        self.seek(size)
        return super().truncate(size)
    def getvalue(self):
        value = super().getvalue()
        return value + '\\n' if value and not value.endswith('\\n') else value
    def write(self, value):
        raw = value.encode('utf-8')
        data = raw[:_Capture.remaining]
        _Capture.remaining -= len(data)
        _Capture.overflow += len(raw) - len(data)
        super().write(data.decode('utf-8', errors='ignore'))
        return len(value)
class _Runner(doctest.DocTestRunner):
    first = ''
    def __init__(self, *args, **kwargs):
        global _last_runner
        super().__init__(*args, **kwargs)
        _last_runner = self
        self._fakeout = _BoundedOutput()
    def report_failure(self, out, test, example, got):
        if not self.first:
            self.first = 'source: ' + example.source + ' expected: ' + example.want + ' got: ' + got
    def report_unexpected_exception(self, out, test, example, exc_info):
        if not self.first:
            self.first = 'source: ' + example.source + ' expected: ' + example.want + ' got: ' + exc_info[0].__name__ + ': ' + str(exc_info[1])
def _run_check(check):
    try:
        overflow = _Capture.overflow
        path = check['path']
        if path.startswith('/') or '..' in path.split('/') or '\\\\' in path:
            raise ValueError('invalid check path')
        name = os.path.splitext(path)[0].replace('/', '.')
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        runner = _Runner()
        if check.get('text', '').strip():
            test = doctest.DocTestParser().get_doctest(check['text'], module.__dict__, name, path, 0)
            result = runner.run(test, out=lambda value: None)
            detail = runner.first
        else:
            # testmod uses DocTestRunner internally; retain its first failure too.
            old_runner = doctest.DocTestRunner
            doctest.DocTestRunner = _Runner
            try:
                result = doctest.testmod(module)
                detail = _last_runner.first
            finally:
                doctest.DocTestRunner = old_runner
        if _Capture.overflow > overflow:
            return {'passed': False, 'detail': 'student output exceeded 8 KB limit'}
        if result.attempted == 0:
            return {'passed': False, 'detail': 'no doctest examples found'}
        counts = {'examples': {'passed': result.attempted - result.failed, 'total': result.attempted}} if _job.get('exampleCounts') else {}
        if result.failed == 0:
            return {'passed': True, 'detail': f'{result.attempted}/{result.attempted} examples passed', **counts}
        return {'passed': False, 'detail': ' '.join(detail.split())[:300], **counts}
    except BaseException as error:
        return {'passed': False, 'detail': ' '.join((type(error).__name__ + ': ' + str(error)).split())[:300]}
`);
write('{"ready":true}\n');
for (const check of job.checks) {
  py.globals.set('_check_json', JSON.stringify(check));
  const result = JSON.parse(py.runPython('json.dumps(_run_check(json.loads(_check_json)))'));
  write(JSON.stringify({ id: check.id, ...result }) + '\n');
}
host.exit(0);
