let accountMode = 'signin';

function renderAccount() {
  const root = document.getElementById('view-account');
  root.replaceChildren();
  root.appendChild(el('p', { class: 'eyebrow' }, 'Your Wanderback account'));

  if (!DB.isBackendReady) {
    root.append(
      el('h2', null, 'Connect an account backend'),
      el('p', { class: 'account-copy' }, 'Sign-in and report ownership use Supabase. Add your project anon key to config.js, then run the setup SQL included with this app.')
    );
    return;
  }

  DB.getUser().then((user) => {
    if (!root.isConnected) return;
    if (!user) renderAuthForm(root);
    else renderAccountDashboard(root, user);
  }).catch((error) => {
    console.error('Could not load account session:', error);
    root.appendChild(el('p', { class: 'empty' }, 'Could not load your account. Please refresh and try again.'));
  });
}

function renderAuthForm(root) {
  const registering = accountMode === 'signup';
  const fullName = el('input', { type: 'text', autocomplete: 'name', placeholder: 'Your full name', required: true });
  const phone = el('input', { type: 'tel', autocomplete: 'tel', placeholder: 'Phone number (optional)' });
  const email = el('input', { type: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true });
  const password = el('input', {
    type: 'password',
    autocomplete: registering ? 'new-password' : 'current-password',
    minlength: 8,
    placeholder: 'At least 8 characters',
    required: true
  });
  const submit = el('button', { class: 'btn btn-block', type: 'submit' }, registering ? 'Create account' : 'Sign in');
  const message = el('p', { class: 'account-copy', 'aria-live': 'polite' });
  const help = registering
    ? el('p', { class: 'account-copy' }, 'If you already created an account, switch to Sign in instead of requesting another confirmation email.')
    : null;
  const form = el('form', { class: 'form account-form' },
    registering ? accountField('Full name', fullName) : null,
    registering ? accountField('Phone', phone) : null,
    accountField('Email', email),
    accountField('Password', password),
    submit
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    message.textContent = '';
    try {
      if (registering) {
        const result = await DB.signUp(email.value.trim(), password.value, fullName.value.trim(), phone.value.trim());
        if (!result.session) {
          message.textContent = 'Check your email for a confirmation link, then sign in here.';
          return;
        }
        toast('Your account is ready.');
      } else {
        await DB.signIn(email.value.trim(), password.value);
        toast('Welcome back.');
      }
      renderAccount();
    } catch (error) {
      console.error('Account authentication failed:', error);
      const errorText = String(error.message || error.code || '').toLowerCase();
      if (error.status === 429 || errorText.includes('rate limit') || errorText.includes('rate exceeded')) {
        message.textContent = registering
          ? 'Supabase has temporarily limited confirmation emails. Wait before trying again. If this email already has an account, switch to Sign in. For reliable signup emails, configure custom SMTP in your Supabase project.'
          : 'Supabase has temporarily limited authentication requests. Wait a little, then try signing in again. If this continues, check your Supabase Auth logs and email provider settings.';
      } else if (errorText.includes('email not confirmed')) {
        message.textContent = 'This account still needs email confirmation. Check your inbox and spam folder for the latest confirmation email before signing in.';
      } else if (errorText.includes('invalid login credentials')) {
        message.textContent = 'Email or password is incorrect. If you have not registered yet, switch to Create an account.';
      } else {
        message.textContent = error.message || 'Could not sign in. Please check your details and try again.';
      }
    } finally {
      submit.disabled = false;
    }
  });

  const modeButton = el('button', {
    type: 'button',
    class: 'btn btn-outline btn-block',
    onclick: () => {
      accountMode = registering ? 'signin' : 'signup';
      renderAccount();
    }
  }, registering ? 'Already have an account? Sign in' : 'New to Wanderback? Create an account');

  root.append(
    el('section', { class: 'account-panel' },
      el('h2', null, registering ? 'Create your account' : 'Sign in'),
      el('p', { class: 'account-copy' }, 'An account is needed to submit reports and see your personal match suggestions.'),
      help,
      form,
      message,
      modeButton
    )
  );
}

function accountField(label, input) {
  if (!input.id) input.id = 'account-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return el('div', null, el('label', { htmlFor: input.id }, label), input);
}

async function renderAccountDashboard(root, user) {
  root.replaceChildren(
    el('p', { class: 'eyebrow' }, 'Your Wanderback account'),
    el('h2', null, 'Your account')
  );

  try {
    const profile = await DB.getProfile();
    if (!root.isConnected) return;

    const fullName = el('input', { type: 'text', autocomplete: 'name', required: true, value: profile.full_name || '' });
    const phone = el('input', { type: 'tel', autocomplete: 'tel', value: profile.phone || '' });
    const email = el('input', { type: 'email', value: user.email || '', disabled: true });
    const save = el('button', { type: 'submit', class: 'btn btn-block' }, 'Save personal information');
    const status = el('p', { class: 'account-copy', 'aria-live': 'polite' });
    const profileForm = el('form', { class: 'form account-form' },
      accountField('Full name', fullName),
      accountField('Phone', phone),
      accountField('Email', email),
      save
    );
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      status.textContent = '';
      try {
        await DB.saveProfile({ full_name: fullName.value.trim(), phone: phone.value.trim() });
        status.textContent = 'Your account details have been saved.';
      } catch (error) {
        console.error('Could not save account profile:', error);
        status.textContent = error.message || 'Could not save your account details.';
      } finally {
        save.disabled = false;
      }
    });

    const signOut = el('button', {
      type: 'button',
      class: 'btn btn-outline',
      onclick: async () => {
        signOut.disabled = true;
        try {
          await DB.signOut();
          accountMode = 'signin';
          renderAccount();
        } catch (error) {
          console.error('Sign out failed:', error);
          toast('Could not sign out. Please try again.');
          signOut.disabled = false;
        }
      }
    }, 'Sign out');
    const reportsSection = el('section', { class: 'account-section' },
      el('h3', null, 'Your reports'),
      el('p', { class: 'account-copy' }, 'Reports you submit are kept in your account.')
    );
    const matchSection = el('section', { class: 'account-section' },
      el('h3', null, 'Strong possible matches'),
      el('p', { class: 'account-copy' }, 'Suggestions with a match score over 70%, sorted strongest first. The score is an estimate, not a guarantee; verify before arranging a handoff.')
    );

    root.append(
      el('section', { class: 'account-panel' },
        el('div', { class: 'account-heading' },
          el('div', null,
            el('h3', null, profile.full_name || user.email || 'Your profile'),
            el('p', { class: 'card-meta' }, user.email || '')
          ),
          signOut
        ),
        profileForm,
        status
      ),
      reportsSection,
      matchSection
    );

    const reportTables = ['lost_items', 'found_items', 'lost_people', 'found_people'];
    const reportResults = await Promise.all(reportTables.map((table) => DB.fetchMine(table)));
    if (!root.isConnected) return;
    const reports = reportResults.flatMap((rows, index) =>
      rows.map((row) => ({ ...row, reportTable: reportTables[index] }))
    );

    if (!reports.length) {
      reportsSection.appendChild(el('p', { class: 'empty' }, 'You have not submitted any reports yet.'));
      matchSection.appendChild(el('p', { class: 'empty' }, 'Your match suggestions will appear here when you submit a report.'));
      return;
    }

    const reportList = el('div', { class: 'card-list' });
    reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach((report) => {
      const isLost = report.reportTable.startsWith('lost_');
      reportList.appendChild(el('article', { class: 'card account-report' },
        el('div', { class: 'card-head' },
          el('span', { class: 'card-icon', 'aria-hidden': 'true' }, placeIcon(report.place_type)),
          el('div', null,
            el('p', { class: 'card-title' }, report.title || 'Report'),
            el('p', { class: 'card-meta' }, (isLost ? 'Lost' : 'Found') + ' · ' + (report.location_name || 'Unknown location'))
          )
        ),
        el('p', { class: 'card-text' }, report.public_details || ''),
        report.photo_url ? el('img', { class: 'card-photo', src: report.photo_url, alt: report.title || 'Report photo', loading: 'lazy' }) : null,
        el('span', { class: 'badge ' + (isLost ? 'badge-lost' : 'badge-found') }, report.status || 'open')
      ));
    });
    reportsSection.appendChild(reportList);

    const matchInputs = reports.filter((report) => report.reportTable.endsWith('_items') || report.reportTable.endsWith('_people'));
    const groups = await Promise.all([
      findAccountMatches(matchInputs.filter((report) => report.reportTable.endsWith('_items')), false),
      findAccountMatches(matchInputs.filter((report) => report.reportTable.endsWith('_people')), true)
    ]);
    if (!root.isConnected) return;

    const uniqueMatches = new Map();
    groups.flat().forEach((match) => {
      const key = [match.reportSide, match.report.id, match.candidate.id, match.found.id].join(':');
      if (!uniqueMatches.has(key)) uniqueMatches.set(key, match);
    });
    const matches = Array.from(uniqueMatches.values())
      .filter((match) => match.score > DASHBOARD_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    if (!matches.length) {
      matchSection.appendChild(el('p', { class: 'empty' }, 'No strong matches yet. We will keep checking as new reports are added.'));
      return;
    }

    const matchList = el('div', { class: 'card-list' });
    matches.forEach((match) => {
      const candidate = match.reportSide === 'lost' ? match.found : match.candidate;
      matchList.appendChild(el('article', { class: 'card account-match' },
        el('div', { class: 'account-match-top' },
          el('span', { class: 'badge badge-found' }, Math.ceil(match.score * 100) + '% match'),
          el('span', { class: 'card-meta' }, match.reportSide === 'lost' ? 'Possible found report' : 'Possible lost report')
        ),
        el('p', { class: 'card-title' }, candidate.title || 'Possible match'),
        el('p', { class: 'card-meta' }, candidate.location_name || 'Unknown location'),
        el('p', { class: 'card-text' }, candidate.public_details || ''),
        candidate.photo_url ? el('img', { class: 'card-photo', src: candidate.photo_url, alt: candidate.title || 'Possible match photo', loading: 'lazy' }) : null,
        el('button', {
          type: 'button',
          class: 'btn btn-block',
          onclick: () => showMatch(match.report, match, match.reportTable.endsWith('_people'), match.reportSide)
        }, 'Verify further')
      ));
    });
    matchSection.appendChild(matchList);
  } catch (error) {
    console.error('Could not load account dashboard:', error);
    root.appendChild(el('p', { class: 'empty' }, 'Could not load your reports and matches. Please refresh and try again.'));
  }
}
