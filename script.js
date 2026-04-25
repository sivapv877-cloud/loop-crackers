const apiUrl = 'http://localhost:3000/jobs';
const skillFilter = document.getElementById('skill-filter');
const companyFilter = document.getElementById('company-filter');
const clearFiltersButton = document.getElementById('clear-filters');
const refreshJobsButton = document.getElementById('refresh-jobs');
const jobCountLabel = document.getElementById('job-count');
const jobsList = document.getElementById('jobs-list');

let jobs = [];

async function fetchJobs() {
  jobCountLabel.textContent = 'Loading jobs...';
  jobsList.innerHTML = '';

  try {
    const response = await fetch(apiUrl);
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
      </article>
    `;
  }).join('');

  jobCountLabel.textContent = `${filteredJobs.length} job${filteredJobs.length === 1 ? '' : 's'} found`;
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
