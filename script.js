const apiUrl = 'http://localhost:3000';
const skillFilter = document.getElementById('skill-filter');
const companyFilter = document.getElementById('company-filter');
const clearFiltersButton = document.getElementById('clear-filters');
const refreshJobsButton = document.getElementById('refresh-jobs');
const jobCountLabel = document.getElementById('job-count');
const jobsList = document.getElementById('jobs-list');
const applicationMessage = document.getElementById('application-message');
const applicationsSection = document.getElementById('applications-section');
const applicationCountLabel = document.getElementById('application-count');
const applicationsList = document.getElementById('applications-list');
const userNameInput = document.getElementById('user-name');
const userEmailInput = document.getElementById('user-email');
const userRoleSelect = document.getElementById('user-role');

let jobs = [];
let applications = [];
let applicationPollInterval = null;

function setMessage(text, type = 'info') {
  applicationMessage.textContent = text;
  applicationMessage.className = `application-message ${type}`;
}

function clearMessage() {
  applicationMessage.textContent = '';
  applicationMessage.className = 'application-message';
}

function getApplicantData(allowEmptyEmail = false) {
  const name = userNameInput.value.trim();
  const email = userEmailInput.value.trim();
  const role = userRoleSelect.value;

  if (!name) {
    if (!allowEmptyEmail) {
      setMessage('Please enter your name before applying.', 'error');
    }
    return null;
  }

  if (!email && !allowEmptyEmail) {
    setMessage('Please enter your email before applying.', 'error');
    return null;
  }

  return { name, email, role };
}

function getApplicantEmail() {
  return userEmailInput.value.trim().toLowerCase();
}

function shouldShowApplications() {
  const applicant = getApplicantData(true);
  return applicant && applicant.role === 'job_seeker' && applicant.email;
}

async function fetchApplications() {
  if (!shouldShowApplications()) {
    applications = [];
    renderApplications();
    return;
  }

  const email = getApplicantEmail();
  try {
    const response = await fetch(`${apiUrl}/applications?applicantEmail=${encodeURIComponent(email)}`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    applications = Array.isArray(data.applications) ? data.applications : [];
    renderApplications();
  } catch (error) {
    applications = [];
    renderApplications();
    setMessage('Unable to load your applications right now.', 'error');
    console.error('Failed to fetch applications:', error);
  }
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
    await fetchApplications();
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
    await fetchApplications();
    renderJobs();
  } catch (error) {
    setMessage(error.message, 'error');
    console.error('Application error:', error);
  }
}

function renderApplications() {
  if (!shouldShowApplications()) {
    applicationsSection.style.display = 'none';
    return;
  }

  applicationsSection.style.display = 'block';

  if (!applications.length) {
    applicationsList.innerHTML = '<div class="message">You have not applied to any jobs yet.</div>';
    applicationCountLabel.textContent = '0 applications';
    return;
  }

  applicationsList.innerHTML = applications.map((application) => `
    <article class="application-card">
      <div class="application-info">
        <h3>${application.jobTitle}</h3>
        <span><strong>Status:</strong> ${application.status}</span>
        <span><strong>Applied on:</strong> ${new Date(application.createdAt).toLocaleDateString()}</span>
      </div>
      <div class="application-meta">
        <span><strong>Email:</strong> ${application.applicantEmail}</span>
      </div>
    </article>
  `).join('');

  applicationCountLabel.textContent = `${applications.length} application${applications.length === 1 ? '' : 's'}`;
}

function renderJobs() {
  const skillQuery = skillFilter.value.trim().toLowerCase();
  const companyQuery = companyFilter.value.trim().toLowerCase();
  const appliedJobIds = new Set(applications.map((app) => String(app.jobId)));

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
    const jobId = String(job._id);
    const isApplied = appliedJobIds.has(jobId);
    const appliedData = applications.find((app) => String(app.jobId) === jobId);
    const statusLabel = isApplied ? `<div class="job-status">Status: ${appliedData?.status || 'Applied'}</div>` : '';
    return `
      <article class="job-card">
        <h2>${job.title}</h2>
        <div class="job-meta">
          <span><strong>Company:</strong> ${job.postedByName || 'Unknown'}</span>
          <span><strong>Skills:</strong> ${skills || 'N/A'}</span>
        </div>
        <p>${job.description}</p>
        ${statusLabel}
        <button type="button" class="apply-button" data-job-id="${jobId}" ${isApplied ? 'disabled' : ''}>
          ${isApplied ? 'Applied' : 'Apply'}
        </button>
      </article>
    `;
  }).join('');

  jobCountLabel.textContent = `${filteredJobs.length} job${filteredJobs.length === 1 ? '' : 's'} found`;
  document.querySelectorAll('.apply-button').forEach((button) => {
    button.addEventListener('click', () => applyToJob(button.dataset.jobId));
  });
}

function updateApplicationPolling() {
  clearInterval(applicationPollInterval);
  if (!shouldShowApplications()) {
    applications = [];
    renderApplications();
    return;
  }

  fetchApplications();
  applicationPollInterval = setInterval(fetchApplications, 10000);
}

clearFiltersButton.addEventListener('click', () => {
  skillFilter.value = '';
  companyFilter.value = '';
  renderJobs();
});

skillFilter.addEventListener('input', renderJobs);
companyFilter.addEventListener('input', renderJobs);
refreshJobsButton.addEventListener('click', fetchJobs);
userEmailInput.addEventListener('input', updateApplicationPolling);
userRoleSelect.addEventListener('change', updateApplicationPolling);

fetchJobs();
