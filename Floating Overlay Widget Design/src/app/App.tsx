import { GuruWidget } from './components/GuruWidget';

export default function App() {
  return (
    <div className="size-full flex items-center justify-center" style={{ background: '#0B0B12' }}>
      {/* Demo background content to show the widget works over other UI */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-light" style={{ color: '#FFFFFF', opacity: 0.95 }}>
          Guru
        </h1>
        <p className="text-lg" style={{ color: '#A0A3B1' }}>
          Your calm, intelligent study companion
        </p>
        <p className="text-sm max-w-md mx-auto" style={{ color: '#A0A3B1', opacity: 0.7 }}>
          The floating widget in the bottom-right corner acts as your virtual body double,
          keeping you anchored to your task with a supportive, non-judgmental presence.
        </p>
      </div>

      {/* The floating overlay widget */}
      <GuruWidget appName="YouTube" isRecording={true} />
    </div>
  );
}