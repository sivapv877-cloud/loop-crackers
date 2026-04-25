const input = document.getElementById('user-input');
const button = document.getElementById('submit-button');
const outputArea = document.getElementById('output-area');

button.addEventListener('click', () => {
  const text = input.value.trim();
  if (!text) {
    outputArea.value = 'Please enter some text before clicking the button.';
    return;
  }

  outputArea.value = `You entered: ${text}`;
});
