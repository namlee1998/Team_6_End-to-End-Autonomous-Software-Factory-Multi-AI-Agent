const readline = require('readline');

function usage() {
  console.log('Usage: npm run admin:create -- <email> [password] [full name]');
  console.log('Example: npm run admin:create -- admin@example.com MyPassword "Super Admin"');
  console.log('You can also set ADMIN_PASSWORD and ADMIN_FULL_NAME environment variables.');
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const writeToOutput = rl._writeToOutput;
    rl.stdoutMuted = true;
    rl._writeToOutput = function writeMuted(output) {
      if (rl.stdoutMuted && output !== '\r\n' && output !== '\n') {
        rl.output.write('*');
        return;
      }
      writeToOutput.call(rl, output);
    };

    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const [, , emailArg, passwordArg, ...nameParts] = process.argv;
  const email = emailArg?.trim();

  if (!email || email === '--help' || email === '-h') {
    usage();
    process.exit(email ? 0 : 1);
  }

  if (!email.includes('@')) {
    throw new Error('Admin email must be a valid email address.');
  }

  const password = passwordArg || process.env.ADMIN_PASSWORD || await promptHidden('Admin password: ');
  const fullName = nameParts.join(' ').trim() || process.env.ADMIN_FULL_NAME || 'Super Admin';

  if (!password || password.length < 8) {
    throw new Error('Admin password must be at least 8 characters.');
  }

  const AdminUser = require('../src/models/AdminUser');
  const existing = await AdminUser.findByEmail(email);
  if (existing) {
    console.log(`Admin already exists: ${existing.email}`);
    return;
  }

  const admin = await AdminUser.create({ email, password, fullName });
  console.log(`Created admin: ${admin.email}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
