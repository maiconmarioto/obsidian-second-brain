import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { scaffoldProject } from './project-init.js';

async function writeTemplate(root, name, content) {
  const filePath = path.join(root, '05-templates', name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

test('project-init scaffolds canonical project files and sessions folder', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-ai-project-init-'));

  await writeTemplate(
    root,
    'template-project.md',
    `---
type: project
status: proposed
owner:
created:
updated:
---

# Project: {{title}}

\`\`\`text
{{project-name}}/
└── sessions/
\`\`\`
`,
  );
  await writeTemplate(
    root,
    'template-context.md',
    `---
type: context
updated:
---
`,
  );
  await writeTemplate(
    root,
    'template-tasks.md',
    `---
type: tasks
updated:
---
`,
  );

  const result = await scaffoldProject(
    {
      root,
    },
    {
      slug: 'my-project',
      title: 'My Project',
      owner: 'Maicon',
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.projectRoot, '01-projects/my-project');

  const sessionsDir = path.join(root, '01-projects', 'my-project', 'sessions');
  const indexFile = path.join(root, '01-projects', 'my-project', 'index.md');
  const indexRaw = await fs.readFile(indexFile, 'utf8');

  assert.ok((await fs.stat(sessionsDir)).isDirectory());
  assert.match(indexRaw, /# Project: My Project/);
  assert.match(indexRaw, /owner: "Maicon"/);
  assert.match(indexRaw, /created: \d{4}-\d{2}-\d{2}/);

  await fs.rm(root, { recursive: true, force: true });
});
