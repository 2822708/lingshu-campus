import type { CardEnemyArchetype } from '../types';

/** An engineering trial apparatus; all geometry is decorative and has no rules. */
export function TrialConstruct({
  archetype,
}: {
  archetype?: CardEnemyArchetype;
}) {
  const shield = archetype === 'sentinel' || archetype === 'counterguard';
  const repair = archetype === 'regenerator';
  const waveform = archetype === 'disruptor';
  const kind = shield
    ? 'feedback-array'
    : repair
      ? 'repair-automaton'
      : waveform
        ? 'signal-illusion'
        : 'calibration-automaton';
  return (
    <svg
      className="ct-trial-construct"
      data-construct={kind}
      viewBox="0 0 360 520"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <ellipse
        cx="182"
        cy="491"
        rx="132"
        ry="13"
        fill="#a6ac8f"
        opacity=".2"
        stroke="none"
      />
      <g opacity=".32" strokeWidth="1">
        <path d="M27 91h306M27 402h306M58 64v373M304 64v373M34 113v267m-5-267h10m-10 267h10M320 130v228m-5-228h10m-10 228h10" />
        <path d="M78 80h204m-204-5v10m204-10v10M94 448h174" />
        <circle cx="181" cy="247" r="143" strokeDasharray="2 9" />
      </g>
      <g stroke="#a46c4b" opacity=".65">
        <circle cx="181" cy="247" r="111" strokeWidth="1.5" />
        <path d="M181 124v20m0 206v20M58 247h20m206 0h20M94 160l15 15m145 145 15 15M94 334l15-15m145-145 15-15" />
      </g>
      <path
        d="m113 383-19 61-19 30h51l17-36 11-38m54 0 13 37 18 37h48l-20-30-18-61"
        fill="#a8b59a"
      />
      <path
        d="m114 392-7 49h23l15-42m64-2 17 44h24l-13-49M77 474h48m115 0h46"
        strokeWidth="4"
      />
      <path d="m123 379 15-55h86l18 55-25 25h-69z" fill="#ced1b8" />
      <path d="M144 352h73m-66 13h58m-49 13h42" opacity=".5" />
      {shield ? (
        <g>
          <path
            d="m179 116 91 45 31 91-43 100-78 39-80-39-42-100 31-91z"
            fill="#cbd0b6"
            strokeWidth="3"
          />
          <path
            d="m179 138 73 37 25 77-36 82-61 31-62-31-36-82 25-77z"
            fill="#eee9d7"
          />
          <path d="M129 192h100v119H129z" fill="#a3b19a" />
          <path d="M139 210h24v24h-24zm58 0h23v24h-23zM151 272h57m-49 13h42M163 220h34m-17-42v33m0 23v37m-53-20h106" />
          <path
            d="m111 174-22-13-31 92 42 98 20-16m126-161 23-13 31 92-43 98-17-16"
            stroke="#a56d4e"
            strokeWidth="5"
          />
          <circle cx="180" cy="251" r="12" fill="#a56d4e" />
        </g>
      ) : repair ? (
        <g>
          <path
            d="m124 135 57-24 58 24 24 73-21 113-62 42-61-42-21-113z"
            fill="#c6ccb0"
            strokeWidth="3"
          />
          <path
            d="m127 162 53-22 54 22 17 49-18 91-53 36-52-36-18-91z"
            fill="#ece8d7"
          />
          <circle cx="181" cy="239" r="62" strokeWidth="10" stroke="#9bac91" />
          <path
            d="M158 195c53-24 90 41 47 70m0-17v17h17M201 286c-52 24-91-41-46-74m0 17v-17h-17"
            stroke="#9e6245"
            strokeWidth="4"
          />
          <path
            d="M102 198 66 226l-6 99 31 17 16-20-23-14 8-64 15-9m153-37 35 28 6 99-31 17-16-20 23-14-8-64-15-9"
            fill="#b8c0a6"
          />
          <path d="M136 146v-25h89v25M157 125V99h48v26" />
        </g>
      ) : waveform ? (
        <g>
          <path
            d="m118 148 62-31 63 31 21 194-84 45-84-45z"
            fill="#cbd1bb"
            opacity=".7"
            strokeDasharray="8 5"
          />
          <path d="M79 171h204v154H79z" fill="#d4d7be" strokeWidth="3" />
          <path d="M94 186h174v124H94z" fill="#f3eedf" />
          <path
            d="M99 248h26l13-39 23 78 23-78 23 78 14-39h42"
            stroke="#9b6449"
            strokeWidth="4"
          />
          <path
            d="M112 202v93m34-93v93m35-93v93m35-93v93m34-93v93M100 222h161m-161 52h161"
            opacity=".2"
            strokeWidth="1"
          />
          <path d="M138 326v24h86v-24m-70 24v18h54v-18M100 164l-17-22m179 22 17-22M180 116V83m-12 8h24" />
          <path
            d="m74 222-24 12 9 47 16 7m211-66 24 12-9 47-16 7"
            stroke="#a66f4c"
            strokeWidth="3"
          />
        </g>
      ) : (
        <g>
          <path
            d="m133 130 47-24 49 24 13 56-18 27h-89l-17-27z"
            fill="#c5ccb0"
            strokeWidth="3"
          />
          <path d="M142 141h76v39h-76z" fill="#eee9d8" />
          <path
            d="M150 160h15l6-10 9 21 9-21 8 10h13"
            stroke="#9d6548"
            strokeWidth="3"
          />
          <path
            d="m136 214-35 37 13 72 66 38 68-38 12-72-35-37z"
            fill="#bbc6ab"
            strokeWidth="3"
          />
          <path d="m139 235 41-10 43 10 17 67-60 36-58-36z" fill="#e7e5d1" />
          <circle cx="180" cy="280" r="33" fill="#b8c4a5" />
          <path
            d="M159 270h43m-43 13h43m-22-32v55m-14-40v25m28-25v25"
            stroke="#a26a4a"
            strokeWidth="3"
          />
          <path
            d="m106 247-35-10-18 20 5 81 29 11 13-18-23-15 1-51 24 4m153-23 35-10 18 20-5 81-29 11-13-18 23-15-1-51-24 4"
            fill="#c4cbb0"
          />
          <path
            d="m67 251-4 67m235-67 3 67M149 125l-12-21m73 21 12-21"
            strokeWidth="1.3"
          />
        </g>
      )}
      <g opacity=".5" strokeWidth="1">
        <path d="m67 388 26-12m-26 20 26-12m182-8 25 12m-25-4 25 12M148 464h11m42 0h11" />
        <path d="M30 450h27v20m276-20h-27v20M28 43h30m-15-15v30m244-15h30m-15-15v30" />
      </g>
    </svg>
  );
}
