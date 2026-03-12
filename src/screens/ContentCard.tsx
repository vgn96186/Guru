import React, { useEffect, useState } from 'react';

import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Image
} from 'react-native';
import type {
  AIContent, KeyPointsContent, QuizContent, StoryContent,
  MnemonicContent, TeachBackContent, ErrorHuntContent, DetectiveContent, ManualContent
} from '../types';

import { askGuru } from '../services/aiService';
import { fetchWikipediaImage } from '../services/imageService';
import { isContentFlagged, setContentFlagged } from '../db/queries/aiCache';
import GuruChatOverlay from '../components/GuruChatOverlay';

interface TopicImageProps {
  topicName: string;
}

function TopicImage({ topicName }: TopicImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchWikipediaImage(topicName).then(setImageUrl);
  }, [topicName]);

  if (!imageUrl) return null;

  return (
    <Image 
      source={{ uri: imageUrl }} 
      style={s.topicImage} 
      resizeMode="contain"
    />
  );
}

interface Props {
  content: AIContent;
  topicId?: number;
  onDone: (confidence: number) => void;
  onSkip: () => void;
  onQuizAnswered?: (correct: boolean) => void;
  onQuizComplete?: (correct: number, total: number) => void;
}

export default function ContentCard({ content, topicId, onDone, onSkip, onQuizAnswered, onQuizComplete }: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [flagged, setFlagged] = useState(false);

  useEffect(() => {
    if (topicId) {
      setFlagged(isContentFlagged(topicId, content.type));
    } else {
      setFlagged(false);
    }
  }, [topicId, content.type]);

  function handleFlag() {
    if (!topicId) return;
    const newFlagged = !flagged;
    setFlagged(newFlagged);
    setContentFlagged(topicId, content.type, newFlagged);
    if (newFlagged) Alert.alert('Flagged for review', 'This content has been flagged. You can review all flagged items in the Flagged Review section.');
  }

  const handleQuizAnswered = (correct: boolean) => {
    onQuizAnswered?.(correct);
  };

  const card = (() => {
    switch (content.type) {
      case 'keypoints': return <KeyPointsCard content={content} onDone={onDone} onSkip={onSkip} />;
      case 'quiz':      return <QuizCard content={content} onDone={onDone} onSkip={onSkip} onQuizAnswered={handleQuizAnswered} onQuizComplete={onQuizComplete} />;
      case 'story':     return <StoryCard content={content} onDone={onDone} onSkip={onSkip} />;
      case 'mnemonic':  return <MnemonicCard content={content} onDone={onDone} onSkip={onSkip} />;
      case 'teach_back':return <TeachBackCard content={content} onDone={onDone} onSkip={onSkip} />;
      case 'error_hunt':return <ErrorHuntCard content={content} onDone={onDone} onSkip={onSkip} />;
      case 'detective': return <DetectiveCard content={content} onDone={onDone} onSkip={onSkip} />;
      case 'manual':    return <ManualReviewCard content={content} onDone={onDone} onSkip={onSkip} />;
      default:          return null;
    }
  })();

  return (
    <View style={{ flex: 1 }}>
      {card}
      <View style={s.cardActions}>
        {topicId ? (
          <TouchableOpacity style={[s.flagBtn, flagged && s.flagBtnActive]} onPress={handleFlag} activeOpacity={0.8}>
            <Text style={s.flagBtnText}>{flagged ? '🚩 Flagged' : '🏳 Flag'}</Text>
          </TouchableOpacity>
        ) : <View />}
        <TouchableOpacity style={s.askGuruBtn} onPress={() => setChatOpen(true)} activeOpacity={0.85}>
          <Text style={s.askGuruText}>Ask Guru</Text>
        </TouchableOpacity>
      </View>
      <GuruChatOverlay
        visible={chatOpen}
        topicName={content.topicName}
        onClose={() => setChatOpen(false)}
      />
    </View>
  );
}

function ConfidenceRating({ onRate }: { onRate: (n: number) => void }) {
  return (
    <View style={s.ratingContainer}>
      <Text style={s.ratingTitle}>How well did you get this?</Text>
      <View style={s.ratingRow}>
        <TouchableOpacity style={[s.ratingBtn, { flex: 1, borderColor: '#F44336' }]} onPress={() => onRate(2)} activeOpacity={0.8}>
          <Text style={[s.ratingNum, { color: '#F44336' }]}>Not yet</Text>
          <Text style={s.ratingLabel}>😕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.ratingBtn, { flex: 1, borderColor: '#4CAF50' }]} onPress={() => onRate(4)} activeOpacity={0.8}>
          <Text style={[s.ratingNum, { color: '#4CAF50' }]}>Got it!</Text>
          <Text style={s.ratingLabel}>🔥</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const CONFIDENCE_LABELS: Record<number, string> = {
  1: '😬', 2: '😕', 3: '😐', 4: '😊', 5: '🔥',
};

// ── Key Points ────────────────────────────────────────────────────

function KeyPointsCard({ content, onDone, onSkip }: { content: KeyPointsContent } & Omit<Props, 'content'>) {
  const [revealIndex, setRevealIndex] = useState(0);
  const [showRating, setShowRating] = useState(false);
  
  const isFullyRevealed = revealIndex >= content.points.length;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>📌 KEY POINTS</Text>
      <Text style={s.cardTitle}>{content.topicName}</Text>
      <TopicImage topicName={content.topicName} />
      <View style={s.pointsContainer}>
        {content.points.slice(0, revealIndex + 1).map((pt, i) => (
          <View key={i} style={s.pointRow}>
            <Text style={s.bullet}>→</Text>
            <Text style={s.pointText}>{pt}</Text>
          </View>
        ))}
      </View>
      {isFullyRevealed && (
        <View style={s.hookBox}>
          <Text style={s.hookLabel}>💡 Memory Hook</Text>
          <Text style={s.hookText}>{content.memoryHook}</Text>
        </View>
      )}
      {!isFullyRevealed ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setRevealIndex(i => i + 1)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Next Point →</Text>
        </TouchableOpacity>
      ) : !showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Got it →</Text>
        </TouchableOpacity>
      ) : (
        <ConfidenceRating onRate={onDone} />
      )}
      <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
        <Text style={s.skipText}>Skip content type</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Quiz ──────────────────────────────────────────────────────────

function QuizCard({ content, onDone, onSkip, onQuizAnswered, onQuizComplete }: { content: QuizContent } & Omit<Props, 'content'>) {
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showExpl, setShowExpl] = useState(false);
  const [score, setScore] = useState(0);

  const q = content.questions[currentQ];
  if (!q) return null;

  function handleSelect(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    setShowExpl(true);
    const correct = idx === q.correctIndex;
    if (correct) setScore(s => s + 1);
    onQuizAnswered?.(correct);
  }

  function handleNext() {
    if (currentQ < content.questions.length - 1) {
      setCurrentQ(c => c + 1);
      setSelected(null);
      setShowExpl(false);
    } else {
      onQuizComplete?.(score, content.questions.length);
      const confidence = Math.round((score / content.questions.length) * 4) + 1;
      onDone(Math.min(5, confidence));
    }
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>🎯 QUIZ  {currentQ + 1}/{content.questions.length}</Text>
      <Text style={s.cardTitle}>{content.topicName}</Text>
      <TopicImage topicName={content.topicName} />
      <Text style={s.questionText}>{q.question}</Text>
      <View style={s.optionsContainer}>
        {q.options.map((opt, idx) => {
          let bgColor = '#1A1A24';
          let borderColor = '#2A2A38';
          if (selected !== null) {
            if (idx === q.correctIndex) { bgColor = '#1A2A1A'; borderColor = '#4CAF50'; }
            else if (idx === selected) { bgColor = '#2A0A0A'; borderColor = '#F44336'; }
          }
          return (
            <TouchableOpacity
              key={idx}
              style={[s.optionBtn, { backgroundColor: bgColor, borderColor }]}
              onPress={() => handleSelect(idx)}
              activeOpacity={0.8}
            >
              <Text style={s.optionText}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {showExpl && (
        <View style={s.explBox}>
          <Text style={s.explLabel}>{selected === q.correctIndex ? '✅ Correct!' : '❌ Incorrect'}</Text>
          <Text style={s.explText}>{q.explanation}</Text>
        </View>
      )}
      {showExpl && (
        <TouchableOpacity style={s.doneBtn} onPress={handleNext} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>
            {currentQ < content.questions.length - 1 ? 'Next Question →' : `Done (${score}/${content.questions.length}) →`}
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
        <Text style={s.skipText}>Skip quiz</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Story ─────────────────────────────────────────────────────────

function StoryCard({ content, onDone, onSkip }: { content: StoryContent } & Omit<Props, 'content'>) {
  const [showRating, setShowRating] = useState(false);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>📖 CLINICAL STORY</Text>
      <Text style={s.cardTitle}>{content.topicName}</Text>
      <TopicImage topicName={content.topicName} />
      <Text style={s.storyText}>{content.story}</Text>
      <View style={s.highlightsBox}>
        <Text style={s.highlightsLabel}>Key concepts in this story:</Text>
        <View style={s.highlightChips}>
          {content.keyConceptHighlights.map((kw, i) => (
            <View key={i} style={s.chip}><Text style={s.chipText}>{kw}</Text></View>
          ))}
        </View>
      </View>
      {!showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Read it →</Text>
        </TouchableOpacity>
      ) : (
        <ConfidenceRating onRate={onDone} />
      )}
      <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
        <Text style={s.skipText}>Skip story</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Mnemonic ──────────────────────────────────────────────────────

function MnemonicCard({ content, onDone, onSkip }: { content: MnemonicContent } & Omit<Props, 'content'>) {
  const [revealStep, setRevealStep] = useState(0);
  const [showRating, setShowRating] = useState(false);
  
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>🧠 MNEMONIC</Text>
      <Text style={s.cardTitle}>{content.topicName}</Text>
      <TopicImage topicName={content.topicName} />
      <View style={s.mnemonicBox}>
        <Text style={s.mnemonicMain}>{content.mnemonic}</Text>
      </View>
      <View style={s.expansionList}>
        {revealStep >= 1 && content.expansion.map((line, i) => (
          <Text key={i} style={s.expansionLine}>{line}</Text>
        ))}
      </View>
      {revealStep >= 2 && (
        <View style={s.hookBox}>
          <Text style={s.hookLabel}>💡 Tip</Text>
          <Text style={s.hookText}>{content.tip}</Text>
        </View>
      )}
      {revealStep < 2 ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setRevealStep(i => i + 1)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>{revealStep === 0 ? 'Decode it →' : 'Show tip →'}</Text>
        </TouchableOpacity>
      ) : !showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Got it →</Text>
        </TouchableOpacity>
      ) : (
        <ConfidenceRating onRate={onDone} />
      )}
      <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
        <Text style={s.skipText}>Skip mnemonic</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Teach Back ────────────────────────────────────────────────────

function TeachBackCard({ content, onDone, onSkip }: { content: TeachBackContent } & Omit<Props, 'content'>) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [validating, setValidating] = useState(false);
  const [guruFeedback, setGuruFeedback] = useState<{ feedback: string; score: number; missed: string[] } | null>(null);

  async function handleValidate() {
    if (!answer.trim()) return;
    setValidating(true);
    try {
      const context = `Topic: ${content.topicName}. Expected points: ${content.keyPointsToMention.join(', ')}`;
      const raw = await askGuru(answer, context);
      const parsed = JSON.parse(raw);
      setGuruFeedback(parsed);
      setSubmitted(true);
    } catch (e) {
      // Fallback if AI fails
      setSubmitted(true);
    } finally {
      setValidating(false);
    }
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>🎤 TEACH BACK</Text>
      <Text style={s.cardTitle}>{content.topicName}</Text>
      <TopicImage topicName={content.topicName} />
      <Text style={s.questionText}>{content.prompt}</Text>
      {!submitted ? (
        <>
          <TextInput
            style={s.textInput}
            placeholder="Type your explanation here..."
            placeholderTextColor="#555"
            multiline
            value={answer}
            onChangeText={setAnswer}
          />
          <TouchableOpacity
            style={[s.doneBtn, (!answer.trim() || validating) && s.disabledBtn]}
            onPress={handleValidate}
            activeOpacity={0.8}
            disabled={validating}
          >
            {validating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.doneBtnText}>Submit to Guru →</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={s.explBox}>
            <Text style={s.explLabel}>Guru's Review (Score: {guruFeedback?.score ?? '?'} / 5):</Text>
            <Text style={s.explText}>{guruFeedback?.feedback ?? content.guruReaction}</Text>
            {guruFeedback?.missed && guruFeedback.missed.length > 0 && (
              <View style={s.missedBox}>
                <Text style={s.missedLabel}>You missed:</Text>
                {guruFeedback.missed.map((m, i) => (
                  <Text key={i} style={s.missedText}>• {m}</Text>
                ))}
              </View>
            )}
          </View>
          <View style={s.highlightsBox}>
            <Text style={s.highlightsLabel}>Expected key points:</Text>
            {content.keyPointsToMention.map((pt, i) => (
              <Text key={i} style={s.pointText}>✓ {pt}</Text>
            ))}
          </View>
          <ConfidenceRating onRate={(n) => {
            // Adjust XP based on Guru's score if possible, or just let confidence handle it
            onDone(n);
          }} />
        </>
      )}
      <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
        <Text style={s.skipText}>Skip this</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Error Hunt ────────────────────────────────────────────────────

function ErrorHuntCard({ content, onDone, onSkip }: { content: ErrorHuntContent } & Omit<Props, 'content'>) {
  const [revealed, setRevealed] = useState(false);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>🔍 ERROR HUNT</Text>
      <Text style={s.cardTitle}>{content.topicName}</Text>
      <TopicImage topicName={content.topicName} />
      <Text style={s.questionText}>Find the 2 factual errors in this paragraph:</Text>
      <View style={s.paragraphBox}>
        <Text style={s.paragraphText}>{content.paragraph}</Text>
      </View>
      {!revealed ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setRevealed(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Reveal Errors →</Text>
        </TouchableOpacity>
      ) : (
        <>
          {content.errors.map((err, i) => (
            <View key={i} style={s.explBox}>
              <Text style={s.explLabel}>Error {i + 1}:</Text>
              <Text style={[s.explText, { color: '#F44336' }]}>❌ "{err.wrong}"</Text>
              <Text style={[s.explText, { color: '#4CAF50' }]}>✅ Should be: "{err.correct}"</Text>
              <Text style={s.explText}>{err.explanation}</Text>
            </View>
          ))}
          <ConfidenceRating onRate={onDone} />
        </>
      )}
      <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
        <Text style={s.skipText}>Skip this</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Detective ─────────────────────────────────────────────────────

function DetectiveCard({ content, onDone, onSkip }: { content: DetectiveContent } & Omit<Props, 'content'>) {
  const [revealedClues, setRevealedClues] = useState(1);
  const [solved, setSolved] = useState(false);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>🕵️ CLINICAL DETECTIVE</Text>
      <Text style={s.cardTitle}>{content.topicName}</Text>
      <TopicImage topicName={content.topicName} />
      {content.clues.slice(0, revealedClues).map((clue, i) => (
        <View key={i} style={[s.clueBox, i === revealedClues - 1 && s.clueBoxNew]}>
          <Text style={s.clueNum}>Clue {i + 1}</Text>
          <Text style={s.clueText}>{clue}</Text>
        </View>
      ))}
      {!solved ? (
        <View style={s.detectiveActions}>
          {revealedClues < content.clues.length && (
            <TouchableOpacity
              style={[s.doneBtn, s.hintBtn]}
              onPress={() => setRevealedClues(c => c + 1)}
              activeOpacity={0.8}
            >
              <Text style={s.doneBtnText}>Reveal next clue</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.doneBtn} onPress={() => setSolved(true)} activeOpacity={0.8}>
            <Text style={s.doneBtnText}>I know the answer →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.explBox}>
            <Text style={s.explLabel}>Diagnosis:</Text>
            <Text style={[s.explText, { color: '#4CAF50', fontSize: 18, fontWeight: '700' }]}>{content.answer}</Text>
            <Text style={s.explText}>{content.explanation}</Text>
          </View>
          <ConfidenceRating onRate={onDone} />
        </>
      )}
      <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
        <Text style={s.skipText}>Skip case</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Manual Review ──────────────────────────────────────────────────

function ManualReviewCard({ content, onDone, onSkip }: { content: ManualContent } & Omit<Props, 'content'>) {
  const [showRating, setShowRating] = useState(false);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>📴 MANUAL REVIEW (OFFLINE)</Text>
      <Text style={s.cardTitle}>{content.topicName}</Text>
      <TopicImage topicName={content.topicName} />
      
      <View style={s.offlineBox}>
        <Text style={s.offlineEmoji}>📡❌</Text>
        <Text style={s.offlineText}>
          Guru is offline or AI is unavailable. Spend 2-5 minutes recalling everything you know about this topic.
        </Text>
      </View>

      <Text style={s.promptText}>
        Close your eyes and try to visualize:
        {'\n'}• Classification / Types
        {'\n'}• Clinical presentation
        {'\n'}• Gold standard diagnosis
        {'\n'}• First-line treatment
      </Text>

      {!showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>I've reviewed it →</Text>
        </TouchableOpacity>
      ) : (
        <ConfidenceRating onRate={onDone} />
      )}
      <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
        <Text style={s.skipText}>Skip topic</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 60 },
  cardType: { color: '#6C63FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 22, marginBottom: 20 },
  topicImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 20, backgroundColor: '#1A1A24' },
  pointsContainer: { marginBottom: 16 },
  pointRow: { flexDirection: 'row', marginBottom: 12 },
  bullet: { color: '#6C63FF', fontSize: 16, marginRight: 10, marginTop: 1 },
  pointText: { color: '#E0E0E0', fontSize: 15, flex: 1, lineHeight: 22 },
  hookBox: { backgroundColor: '#1A1A2E', borderRadius: 12, padding: 14, marginBottom: 20, borderLeftWidth: 3, borderLeftColor: '#6C63FF' },
  hookLabel: { color: '#6C63FF', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  hookText: { color: '#E0E0E0', fontSize: 14, fontStyle: 'italic' },
  doneBtn: { backgroundColor: '#6C63FF', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10 },
  disabledBtn: { backgroundColor: '#333' },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  skipBtn: { padding: 12, alignItems: 'center' },
  skipText: { color: '#555', fontSize: 13 },
  ratingContainer: { marginTop: 16, marginBottom: 10 },
  ratingTitle: { color: '#9E9E9E', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  ratingRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  ratingBtn: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 12, alignItems: 'center', minWidth: 56, borderWidth: 1, borderColor: '#2A2A38' },
  ratingNum: { color: '#fff', fontWeight: '800', fontSize: 18 },
  ratingLabel: { fontSize: 18 },
  questionText: { color: '#E0E0E0', fontSize: 16, lineHeight: 24, marginBottom: 16 },
  optionsContainer: { gap: 8, marginBottom: 12 },
  optionBtn: { borderRadius: 12, padding: 14, borderWidth: 2 },
  optionText: { color: '#E0E0E0', fontSize: 14, lineHeight: 20 },
  explBox: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 14, marginBottom: 12 },
  explLabel: { color: '#9E9E9E', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  explText: { color: '#E0E0E0', fontSize: 14, lineHeight: 20 },
  storyText: { color: '#E0E0E0', fontSize: 15, lineHeight: 26, marginBottom: 20 },
  highlightsBox: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 14, marginBottom: 20 },
  highlightsLabel: { color: '#9E9E9E', fontSize: 11, fontWeight: '700', marginBottom: 8 },
  highlightChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#6C63FF22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#6C63FF44' },
  chipText: { color: '#6C63FF', fontSize: 12, fontWeight: '600' },
  mnemonicBox: { backgroundColor: '#1A1A2E', borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center', borderWidth: 2, borderColor: '#6C63FF' },
  mnemonicMain: { color: '#6C63FF', fontWeight: '900', fontSize: 28, textAlign: 'center', letterSpacing: 2 },
  expansionList: { marginBottom: 16 },
  expansionLine: { color: '#E0E0E0', fontSize: 14, lineHeight: 24, paddingLeft: 8 },
  textInput: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, minHeight: 100, textAlignVertical: 'top', marginBottom: 12, borderWidth: 1, borderColor: '#2A2A38' },
  paragraphBox: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 16, marginBottom: 16 },
  paragraphText: { color: '#E0E0E0', fontSize: 15, lineHeight: 24 },
  clueBox: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 14, marginBottom: 8 },
  clueBoxNew: { borderColor: '#6C63FF', borderWidth: 1 },
  clueNum: { color: '#6C63FF', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  clueText: { color: '#E0E0E0', fontSize: 15, lineHeight: 22 },
  detectiveActions: { gap: 8, marginTop: 8 },
  hintBtn: { backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: '#6C63FF' },
  missedBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2A2A38' },
  missedLabel: { color: '#F44336', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  missedText: { color: '#9E9E9E', fontSize: 13, fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  flagBtn: { backgroundColor: '#1A1A2E', borderColor: '#FF980044', borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  flagBtnActive: { backgroundColor: '#2A1A00', borderColor: '#FF9800' },
  flagBtnText: { color: '#FF9800', fontWeight: '600', fontSize: 12 },
  askGuruBtn: { backgroundColor: '#1A1A2E', borderColor: '#6C63FF66', borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, elevation: 4 },
  askGuruText: { color: '#6C63FF', fontWeight: '700', fontSize: 13 },
  offlineBox: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#333' },
  offlineEmoji: { fontSize: 32, textAlign: 'center', marginBottom: 12 },
  offlineText: { color: '#9E9E9E', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  promptText: { color: '#E0E0E0', fontSize: 15, lineHeight: 28, backgroundColor: '#0A0A14', padding: 20, borderRadius: 12, marginBottom: 32 },
});
