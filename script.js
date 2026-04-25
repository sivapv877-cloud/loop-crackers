const apiUrl = 'http://localhost:3000';
const skillFilter = document.getElementById('skill-filter');
const companyFilter = document.getElementById('company-filter');
const clearFiltersButton = document.getElementById('clear-filters');
const refreshJobsButton = document.getElementById('refresh-jobs');
const jobCountLabel = document.getElementById('job-count');
const jobsList = document.getElementById('jobs-list');
const applicationMessage = document.getElementById('application-message');
const userNameInput = document.getElementById('user-name');
const userEmailInput = document.getElementById('user-email');
const userRoleSelect = document.getElementById('user-role');

let jobs = [];

function setMessage(text, type = 'info') {
  applicationMessage.textContent = text;
  applicationMessage.className = `application-message ${type}`;
}

function clearMessage() {
  applicationMessage.textContent = '';
  applicationMessage.className = 'application-message';
}

function getApplicantData() {
  const name = userNameInput.value.trim();
  const email = userEmailInput.value.trim();
  const role = userRoleSelect.value;

  if (!name || !email) {
    setMessage('Please enter your name and email before applying.', 'error');
    return null;
  }

  return { name, email, role };
}

async function fetchJobs() {
  jobCountLabel.textContent = 'Loading jobs...';
  jobsList.innerHTML = '';
  clearMessage();

  try {
    const response = await fetch(`${apiUrl}/jobs`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    jobs = Array.isArray(data.jobs) ? data.jobs : [];
    renderJobs();
  } catch (error) {
    jobCountLabel.textContent = 'Failed to load jobs.';
    jobsList.innerHTML = `<div class="message">Unable to fetch jobs. Make sure the backend is running at ${apiUrl}</div>`;
    console.error('Failed to fetch jobs:', error);
  }
}

async function applyToJob(jobId) {
  const applicant = getApplicantData();
  if (!applicant) {
    return;
  }

  if (applicant.role !== 'job_seeker') {
    setMessage('Only job seekers can apply to jobs.', 'error');
    return;
  }

  setMessage('Submitting application...', 'info');

  try {
    const response = await fetch(`${apiUrl}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId,
        applicantName: applicant.name,
        applicantEmail: applicant.email,
        applicantRole: applicant.role,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Application failed');
    }

    setMessage(data.message, 'success');
  } catch (error) {
    setMessage(error.message, 'error');
    console.error('Application error:', error);
  }
}

function renderJobs() {
  const skillQuery = skillFilter.value.trim().toLowerCase();
  const companyQuery = companyFilter.value.trim().toLowerCase();

  const filteredJobs = jobs.filter((job) => {
    const matchesSkill = !skillQuery || (Array.isArray(job.skills) && job.skills.some((skill) => skill.toLowerCase().includes(skillQuery)));
    const companyName = (job.postedByName || job.postedByEmail || 'Unknown').toLowerCase();
    const matchesCompany = !companyQuery || companyName.includes(companyQuery);
    return matchesSkill && matchesCompany;
  });

  if (!filteredJobs.length) {
    jobsList.innerHTML = '<div class="message">No jobs found for the selected filters.</div>';
    jobCountLabel.textContent = `${filteredJobs.length} jobs found`;
    return;
  }

  jobsList.innerHTML = filteredJobs.map((job) => {
    const skills = Array.isArray(job.skills) ? job.skills.join(', ') : job.skills;
    return `
      <article class="job-card">
        <h2>${job.title}</h2>
        <div class="job-meta">
          <span><strong>Company:</strong> ${job.postedByName || 'Unknown'}</span>
          <span><strong>Skills:</strong> ${skills || 'N/A'}</span>
        </div>
        <p>${job.description}</p>
        <button type="button" class="apply-button" data-job-id="${job._id}">Apply</button>
      </article>
    `;
  }).join('');

  jobCountLabel.textContent = `${filteredJobs.length} job${filteredJobs.length === 1 ? '' : 's'} found`;
  document.querySelectorAll('.apply-button').forEach((button) => {
    button.addEventListener('click', () => applyToJob(button.dataset.jobId));
  });
}

clearFiltersButton.addEventListener('click', () => {
  skillFilter.value = '';
  companyFilter.value = '';
  renderJobs();
});

skillFilter.addEventListener('input', renderJobs);
companyFilter.addEventListener('input', renderJobs);
refreshJobsButton.addEventListener('click', fetchJobs);

fetchJobs();
