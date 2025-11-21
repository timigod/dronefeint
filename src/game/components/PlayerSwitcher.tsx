import type { Player } from '../scenarios/startingScenario';

interface PlayerSwitcherProps {
  players: Player[];
  activePlayerIndex: number;
  onSelect: (index: number) => void;
}

export const PlayerSwitcher = ({ players, activePlayerIndex, onSelect }: PlayerSwitcherProps) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        display: 'flex',
        gap: '10px',
        zIndex: 110,
      }}
    >
      {players.map((player, idx) => {
        const isActive = idx === activePlayerIndex;
        return (
          <button
            key={player.id}
            onClick={() => onSelect(idx)}
            style={{
              padding: '6px 12px',
              borderRadius: '999px',
              border: `2px solid ${player.color}`,
              backgroundColor: isActive ? `${player.color}33` : 'rgba(20,20,25,0.6)',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
            title={`Switch to ${player.name}`}
          >
            {idx + 1}
          </button>
        );
      })}
    </div>
  );
};
