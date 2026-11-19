const fs = require('fs');
const path = require('path');

const CONTENT_PATH = path.resolve(__dirname, '..', '_src', 'content.json');

async function fetchRepo(repo) {
  const response = await fetch('https://api.github.com/repos/' + repo, {
    headers: {
      'User-Agent': 'sin4ch-site-builder',
      'Accept': 'application/vnd.github+json'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { stargazers_count: stars, forks_count: forks } = await response.json();
  if (![stars, forks].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error('Invalid star or fork count');
  }
  return { stars, forks };
}

async function main() {
  const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
  let failed = 0;
  for (const project of content.projects.filter(project => project.repo)) {
    try {
      Object.assign(project, await fetchRepo(project.repo));
      console.log(`${project.repo}: ${project.stars} stars, ${project.forks} forks`);
    } catch (error) {
      failed += 1;
      console.error(`SKIP ${project.repo}: ${error.message} (kept previous values)`);
    }
  }
  fs.writeFileSync(CONTENT_PATH, JSON.stringify(content, null, 2) + '\n');
  console.log(`baked ${content.projects.length - failed} repositories, ${failed} failed. Now run: bun scripts/generate-route-pages.js`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
