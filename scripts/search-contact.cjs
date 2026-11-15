const { execSync } = require('child_process');

function gitGrep(term) {
  console.log(`=== Git Grep: ${term} ===`);
  try {
    const out = execSync(`git grep -n -i "${term}"`, { encoding: 'utf8' });
    console.log(out.slice(0, 1000));
  } catch (e) {
    console.log('No matches found in git.');
  }
}

gitGrep('8778613372');
gitGrep('step17326552');
