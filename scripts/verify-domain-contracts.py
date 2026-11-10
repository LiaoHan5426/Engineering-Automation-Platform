"""Check state wire parity and paired error resources without building or calling services."""
from pathlib import Path
import json
import re
import subprocess


def files(root, pattern):
    return [Path(path) for path in subprocess.check_output(
        ['rg', '--files', str(root), '-g', pattern], text=True, encoding='utf-8').splitlines()]


def properties(path):
    result = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        key, value = line.split('=', 1)
        assert key not in result, f'Duplicate message key: {path}: {key}'
        assert value.strip(), f'Empty message: {path}: {key}'
        result[key] = value
    return result


def main():
    repository = Path(__file__).resolve().parent.parent
    backend = [p for p in files(repository / 'backend', '*.java')
               if '/src/main/java/' in p.as_posix()]
    frontend = files(repository / 'frontend/packages/runtime-client/src/contracts', '*.ts')
    states = []
    for path in backend:
        source = path.read_text(encoding='utf-8')
        if not re.search(r'public enum \w+ implements WireValue', source):
            continue
        expected = dict(re.findall(r'^    ([A-Z][A-Z0-9_]*)\("([^"]+)"\)', source, re.M))
        matches = []
        for target in frontend:
            match = re.search(r'export const ' + path.stem + r' = \{(.*?)\} as const',
                              target.read_text(encoding='utf-8'), re.S)
            if match:
                matches.append(dict(re.findall(r"\b([A-Z][A-Z0-9_]*): '([^']+)'", match[1])))
        assert matches == [expected], f'Backend/frontend state mismatch: {path.stem}'
        states.append(path.stem)

    codes = {}
    for path in backend:
        if not path.name.endswith('Errors.java'):
            continue
        for code in re.findall(r'^    ([A-Z][A-Z0-9_]+)[,;]', path.read_text(encoding='utf-8'), re.M):
            assert code not in codes, f'Duplicate error code: {code}'
            codes[code] = path

    keys = set()
    bundles = files(repository / 'backend', 'messages_zh_CN.properties')
    for path in bundles:
        zh = properties(path)
        en = properties(path.with_name('messages_en_US.properties'))
        assert zh.keys() == en.keys(), f'Unpaired messages: {path}'
        assert not keys.intersection(zh), f'Duplicate bundle keys: {path}'
        keys.update(zh)
    missing = set('errors.' + code for code in codes).difference(keys)
    assert not missing, f'Missing error messages: {sorted(missing)}'
    print(json.dumps({'stateDomains': len(states), 'errorCatalogs': len(set(codes.values())),
                      'errorCodes': len(codes), 'pairedBundles': len(bundles)}))


if __name__ == '__main__':
    main()
