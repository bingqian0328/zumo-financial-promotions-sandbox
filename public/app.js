const form = document.querySelector('#launch-form');
const input = document.querySelector('#user-id');
const message = document.querySelector('#message');
const button = form.querySelector('button');
const createUserButton = document.querySelector('#create-user');
const createdUser = document.querySelector('#created-user');

createUserButton.addEventListener('click', async () => {
  message.textContent = '';
  createdUser.hidden = true;
  createUserButton.disabled = true;
  createUserButton.firstChild.textContent = 'Creating test user… ';
  try {
    const response = await fetch('/api/users', { method: 'POST' });
    const user = await response.json();
    if (!response.ok) throw new Error(user.error || 'Could not create the test user.');
    input.value = user.id;
    createdUser.textContent = `${user.firstName} ${user.lastName} · ${user.email} · ${user.id}`;
    createdUser.hidden = false;
    createUserButton.firstChild.textContent = 'Test user created ';
  } catch (error) {
    message.textContent = error.message;
    createUserButton.disabled = false;
    createUserButton.firstChild.textContent = 'Create sandbox test user ';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  button.disabled = true;
  button.firstChild.textContent = 'Creating secure session… ';
  try {
    const response = await fetch('/api/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: input.value.trim() }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not create the session.');
    window.location.assign(body.launchUrl);
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
    button.firstChild.textContent = 'Create session & launch ';
  }
});
