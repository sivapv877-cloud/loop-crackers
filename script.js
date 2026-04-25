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
const postedJobsSection = document.getElementById('posted-jobs-section');
const postedJobCountLabel = document.getElementById('posted-job-count');
const postedJobsList = document.getElementById('posted-jobs-list');
const userNameInput = document.getElementById('user-name');
const userEmailInput = document.getElementById('user-email');
const userSkillsInput = document.getElementById('user-skills');
const userRoleSelect = document.getElementById('user-role');

let jobs = [];
let applications = [];
let employerJobs = [];
let pollingInterval = null;
let previousApplicationStatuses = {};

function setMessage(text, type = 'info') {
  applicationMessage.textContent = text;
  applicationMessage.className = `application-message ${type}`;
}

function detectStatusChanges(newApplications) {
  const changes = [];

  for (const app of newApplications) {
    const key = String(app.jobId);
    const previous = previousApplicationStatuses[key];
    if (previous && previous !== app.status) {
      changes.push(`${app.jobTitle}: ${previous} → ${app.status}`);
    }
  }

  previousApplicationStatuses = newApplications.reduce((map, app) => {
    map[String(app.jobId)] = app.status;
    return map;
  }, {});

  return changes;
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

function shouldShowJobSeekerSections() {
  const user = getApplicantData(true);
  return user && user.role === 'job_seeker' && user.email;
}

function shouldShowEmployerSections() {
  const user = getApplicantData(true);
  return user && user.role === 'employer' && user.email;
}

function getUserSkills() {
  return userSkillsInput.value
    .split(',')
    .map((skill) => skill.trim().toLowerCase())
    .filter(Boolean);
}

function computeMatchPercentage(jobSkills = [], userSkills = []) {
  if (!Array.isArray(jobSkills) || !jobSkills.length || !Array.isArray(userSkills) || !userSkills.length) {
    return 0;
  }

  const normalizedJobSkills = [...new Set(jobSkills
    .filter(Boolean)
    .map((skill) => skill.toLowerCase()))];
  const normalizedUserSkills = [...new Set(userSkills)];
  const matchedCount = normalizedJobSkills.filter((skill) => normalizedUserSkills.includes(skill)).length;

  return normalizedJobSkills.length
    ? Math.round((matchedCount / normalizedJobSkills.length) * 100)
    : 0;
}

function getUserHeaderOptions() {
  return {
    headers: {
      'x-user-role': userRoleSelect.value,
      'x-user-email': userEmailInput.value.trim().toLowerCase(),
      'x-user-name': userNameInput.value.trim(),
    },
  };
}

async function fetchApplicationsForJob(jobId) {
  const url = `${apiUrl}/applications?jobId=${encodeURIComponent(jobId)}`;
  const response = await fetch(url, getUserHeaderOptions());
  if (!response.ok) {
    throw new Error('Unable to load applicants for posted jobs.');
  }
  const data = await response.json();
  return Array.isArray(data.applications) ? data.applications : [];
}

async function fetchPostedJobs() {
  if (!shouldShowEmployerSections()) {
    employerJobs = [];
    renderPostedJobs();
    return;
  }

  const email = userEmailInput.value.trim().toLowerCase();

  try {
    const response = await fetch(`${apiUrl}/jobs?postedByEmail=${encodeURIComponent(email)}`);
    if (!response.ok) {
      throw new Error('Unable to load posted jobs.');
    }

    const data = await response.json();
    employerJobs = Array.isArray(data.jobs) ? data.jobs : [];

    await Promise.all(employerJobs.map(async (job) => {
      job.applicants = await fetchApplicationsForJob(job._id);
    }));

    renderPostedJobs();
  } catch (error) {
    employerJobs = [];
    renderPostedJobs();
    console.error('Employer job fetch error:', error);
  }
}

async function fetchApplications() {
  if (!shouldShowJobSeekerSections()) {
    applications = [];
    renderApplications();
    return;
  }

  const email = userEmailInput.value.trim().toLowerCase();
  try {
    const response = await fetch(`${apiUrl}/applications?applicantEmail=${encodeURIComponent(email)}`);
    if (!response.ok) {
      throw new Error('Unable to load applications.');
    }
    const data = await response.json();
    const newApplications = Array.isArray(data.applications) ? data.applications : [];
    const statusChanges = detectStatusChanges(newApplications);
    applications = newApplications;
    if (statusChanges.length) {
      setMessage(`Application status updated: ${statusChanges.join('; ')}`, 'success');
    }
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
    await fetchPostedJobs();
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

async function updateApplicationStatus(applicationId, status) {
  try {
    const response = await fetch(`${apiUrl}/applications/${encodeURIComponent(applicationId)}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getUserHeaderOptions().headers,
      },
      body: JSON.stringify({ status }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update status');
    }

    setMessage(data.message, 'success');
    await fetchPostedJobs();
  } catch (error) {
    setMessage(error.message, 'error');
    console.error('Status update error:', error);
  }
}

function renderApplications() {
  if (!shouldShowJobSeekerSections()) {
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

function renderPostedJobs() {
  if (!shouldShowEmployerSections()) {
    postedJobsSection.style.display = 'none';
    return;
  }

  postedJobsSection.style.display = 'block';

  if (!employerJobs.length) {
    postedJobsList.innerHTML = '<div class="message">You have not posted any jobs yet.</div>';
    postedJobCountLabel.textContent = '0 posted jobs';
    return;
  }

  postedJobsList.innerHTML = employerJobs.map((job) => {
    const skills = Array.isArray(job.skills) ? job.skills.join(', ') : job.skills;
    const applicants = Array.isArray(job.applicants) ? job.applicants : [];
    const applicantRows = applicants.length
      ? applicants.map((app) => `
        <div class="applicant-row">
          <span>${app.applicantName} (${app.applicantEmail})</span>
          <span class="status-pill">${app.status}</span>
          <div class="action-buttons">
            <button type="button" data-app-id="${app._id}" data-status="Shortlisted">Shortlist</button>
            <button type="button" data-app-id="${app._id}" data-status="Interview">Interview</button>
            <button type="button" data-app-id="${app._id}" data-status="Rejected">Reject</button>
          </div>
        </div>
      `).join('')
      : '<div class="message">No applicants yet.</div>';

    return `
      <article class="job-card">
        <h2>${job.title}</h2>
        <div class="job-meta">
          <span><strong>Skills:</strong> ${skills || 'N/A'}</span>
          <span><strong>Applicants:</strong> ${applicants.length}</span>
        </div>
        <p>${job.description}</p>
        <div class="applicant-list">${applicantRows}</div>
      </article>
    `;
  }).join('');

  postedJobCountLabel.textContent = `${employerJobs.length} posted job${employerJobs.length === 1 ? '' : 's'}`;
  postedJobsList.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => updateApplicationStatus(button.dataset.appId, button.dataset.status));
  });
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

  const userSkills = getUserSkills();

  jobsList.innerHTML = filteredJobs.map((job) => {
    const skills = Array.isArray(job.skills) ? job.skills.join(', ') : job.skills;
    const jobId = String(job._id);
    const isApplied = appliedJobIds.has(jobId);
    const appliedData = applications.find((app) => String(app.jobId) === jobId);
    const statusLabel = isApplied ? `<div class="job-status">Status: ${appliedData?.status || 'Applied'}</div>` : '';
    const matchLabel = shouldShowJobSeekerSections() && userSkills.length
      ? `<div class="job-match">You match ${computeMatchPercentage(job.skills, userSkills)}% of this job</div>`
      : '';

    return `
      <article class="job-card">
        <h2>${job.title}</h2>
        <div class="job-meta">
          <span><strong>Company:</strong> ${job.postedByName || 'Unknown'}</span>
          <span><strong>Skills:</strong> ${skills || 'N/A'}</span>
        </div>
        <p>${job.description}</p>
        ${matchLabel}
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

function updatePolling() {
  clearInterval(pollingInterval);
  previousApplicationStatuses = {};
  fetchApplications();
  fetchPostedJobs();
  pollingInterval = setInterval(() => {
    fetchApplications();
    fetchPostedJobs();
  }, 10000);
}

clearFiltersButton.addEventListener('click', () => {
  skillFilter.value = '';
  companyFilter.value = '';
  renderJobs();
});

skillFilter.addEventListener('input', renderJobs);
companyFilter.addEventListener('input', renderJobs);
userSkillsInput.addEventListener('input', renderJobs);
refreshJobsButton.addEventListener('click', fetchJobs);
userEmailInput.addEventListener('input', updatePolling);
userRoleSelect.addEventListener('change', updatePolling);

fetchJobs();
