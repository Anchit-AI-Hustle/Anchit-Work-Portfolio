const fs = require('fs');

const deepDivesHtml = fs.readFileSync('scratch-deep-dives.html', 'utf8');
const chatHtml = fs.readFileSync('scratch-chat.html', 'utf8');
const timelineHtml = fs.readFileSync('scratch-timeline.html', 'utf8');
const highlightsHtml = fs.readFileSync('scratch-highlights.html', 'utf8');
const projectsHtml = fs.readFileSync('scratch-projects.html', 'utf8');

const expDeepHtml = deepDivesHtml.split('id="view-projects"')[0];
const projDeepHtml = '<section class="view" id="view-projects"' + deepDivesHtml.split('id="view-projects"')[1].split('id="view-resume"')[0];
const resumeDeepHtml = '<section class="view" id="view-resume"' + deepDivesHtml.split('id="view-resume"')[1].split('id="view-contact"')[0];
const contactDeepHtml = '<section class="view" id="view-contact"' + deepDivesHtml.split('id="view-contact"')[1];

const n1Html = "<h1>Intro</h1><p>An engineer who learned to love the funnel.</p>";

const newScriptsObj = "    const scripts = {\n" +
  "      n1: { text: 'System initialized. I am the digital construct of Anchit Tandon. I build things that make money. Let me show you.', html: " + JSON.stringify(n1Html) + " },\n" +
  "      n2: { text: 'The Journey. A timeline of where I have been and what I have done.', html: " + JSON.stringify(timelineHtml) + " },\n" +
  "      n3: { text: 'Highlights. You want the numbers. 5X MRR growth. 3 Crore ARR. Ratings 2.4 to 4.0. I engineer the funnel.', html: " + JSON.stringify(highlightsHtml) + " },\n" +
  "      n4: { text: 'Side Projects. AI-first experiments, shipped on weekends.', html: " + JSON.stringify(projectsHtml) + " },\n" +
  "      n5: { text: 'Experience Deep Dive. The complete work history across Vahdam, Times Internet, and more.', html: " + JSON.stringify(expDeepHtml) + " },\n" +
  "      n6: { text: 'Projects Deep Dive. Every major product I have shipped from zero to one.', html: " + JSON.stringify(projDeepHtml) + " },\n" +
  "      n7: { text: 'Interactive Terminal. Ask me anything directly via the command line below.', html: " + JSON.stringify(chatHtml) + " },\n" +
  "      n8: { text: 'Resume. The full professional summary on one page.', html: " + JSON.stringify(resumeDeepHtml) + " },\n" +
  "      n9: { text: 'Contact. Let us initiate a connection.', html: " + JSON.stringify(contactDeepHtml) + " }\n" +
  "    };\n" +
  "    const seq = ['n1','n2','n3','n4','n5','n6','n7','n8','n9'];\n" +
  "    let current = 'n1';";

let html = fs.readFileSync('nexus/index.html', 'utf8');

const startStr = "const scripts = {";
const endStr = "let current = 'intro';";

const startIdx = html.indexOf(startStr);
const endIdx = html.indexOf(endStr, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  html = html.substring(0, startIdx) + newScriptsObj + html.substring(endIdx + endStr.length);
  fs.writeFileSync('nexus/index.html', html);
  console.log('Successfully replaced nexus scripts object.');
} else {
  console.log('Could not find the target string in nexus/index.html');
}
