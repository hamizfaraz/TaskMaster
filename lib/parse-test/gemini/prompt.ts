export function createParseTestPrompt(fileName: string) {
  return `
You are extracting structured syllabus data for a student dashboard preview.

Input document name: ${fileName}

Return JSON only. Do not wrap the response in markdown fences.

Rules:
- Extract exactly the schema requested.
- Prefer the official catalog or course description section for catalogDescription.
- If there is no official description, use course goals, objectives, or learning outcomes.
- Only infer from topic lists when no formal description exists.
- studentSummary must be a practical 2-3 sentence rewrite for a student dashboard.
- descriptionSource must be one of: catalog_description, course_objectives, learning_outcomes, inferred_from_topics.
- keyConcepts should contain 4-15 concise topic labels.
- keyConcepts should reflect the major topics to be covered in the course.
- contacts should include the primary instructor and all teaching assistants when the syllabus provides them.
- Use role values like Professor and TA when applicable.
- contacts may omit email, officeHours, or location only when the syllabus does not provide them.
- courseSection should capture the official section identifier when present, such as 001, 502, or 0W1.
- Do not put classroom, building, or room numbers in courseSection; put those in meetingLocation.
- requiredMaterials should include textbooks, readers, software, websites, or source material the syllabus requires or strongly expects.
- homeworkTools should include homework or class platforms like Canvas, Gradescope, Blackboard, WebAssign, Piazza, or specific coding tools when they are explicitly named.
- gradingBreakdown should include the major categories and weights only when the syllabus explicitly gives them.
- assignments should include all discernible deadlines, exams, quizzes, projects, papers, labs, discussions, and final deliverables.
- events should include every explicit calendar-dated syllabus item, including exams, assignments, presentations, holidays, cancellations, or special meetings.
- Do not include recurring weekly class meetings in events unless the syllabus gives a specific calendar date.
- If one syllabus line contains multiple explicit dates, return separate event objects for each date.
- Preserve the syllabus wording in dateText.
- Only set isoDate when the syllabus includes an explicit calendar date.
- If a date is relative, unclear, or only says something like "Week 4", leave isoDate null.
- Preserve time-of-day details in timeText when present.
- Never invent dates, weights, instructors, or meeting details.
- sourceSnippet should be a short excerpt or paraphrase that points back to the syllabus text.
- Return percentages as whole percent values, for example 40 for 40% and 10 for 10%, never 0.4 or 0.1.
- warnings should only describe high-signal contradictions or meaningful ambiguity.
- Do not add warnings just because routine assignment or quiz dates are not listed unless that omission blocks extracting a major deadline.
`.trim();
}
