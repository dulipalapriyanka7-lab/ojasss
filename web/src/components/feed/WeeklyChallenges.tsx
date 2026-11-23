import { Trophy } from 'lucide-react';
import './weekly-challenges.css';

export function WeeklyChallenges({ names, locked = false }: { names?: string[]; locked?: boolean }) {
  if (!names?.length) return null;

  return (
    <section className="weekly-challenges" aria-label={locked ? 'Challenges for this week' : 'This week’s challenges'}>
      <Trophy size={16} aria-hidden className="weekly-challenges-icon" />
      <div className="weekly-challenges-content">
        <p>{locked ? 'Weekly challenges' : 'This week’s challenges'}</p>
        <ul>
          {names.map(name => <li key={name}>{name}</li>)}
        </ul>
      </div>
    </section>
  );
}
