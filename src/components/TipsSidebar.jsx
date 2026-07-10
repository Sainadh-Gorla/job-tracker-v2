const TIPS = [
  'Tailor your resume keywords to match the job description — many companies filter with ATS software before a human ever sees it.',
  "Follow up about a week after applying if you haven't heard back.",
  'Research your interviewer on LinkedIn beforehand so you can find common ground.',
  'Prepare 2-3 thoughtful questions to ask — it signals genuine interest.',
  'Quantify achievements with numbers wherever you can (%, $, time saved).',
  'Send a thank-you email within 24 hours of an interview.',
  'Keep a running list of accomplishments so resume updates take minutes, not hours.',
  'Practice the STAR method (Situation, Task, Action, Result) for behavioral questions.',
]

export default function TipsSidebar() {
  return (
    <aside className="tips-sidebar">
      <h3>Career Tips</h3>
      <ul className="tips-list">
        {TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </aside>
  )
}
