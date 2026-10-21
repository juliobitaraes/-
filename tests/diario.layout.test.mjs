import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regressao: um max-height fixo com overflow hidden cortava os alunos finais do Diario.
for (const file of ['../css/styles.css', '../web/css/styles.css']) {
    test(`${file}: .accordion-content.open nao limita a altura`, () => {
        const css = readFileSync(new URL(file, import.meta.url), 'utf8');
        const rule = css.match(/\.accordion-content\.open\s*\{([^}]*)\}/);
        assert.ok(rule, 'regra .accordion-content.open nao encontrada');
        assert.match(rule[1], /max-height:\s*none/);
    });
}
