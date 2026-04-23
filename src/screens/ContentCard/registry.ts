import { ContentType } from '../../types';
import { KeyPointsCard } from './cards/KeyPointsCard';
import { MustKnowCard } from './cards/MustKnowCard';
import { QuizCard } from './cards/QuizCard';
import { StoryCard } from './cards/StoryCard';
import { MnemonicCard } from './cards/MnemonicCard';
import { TeachBackCard } from './cards/TeachBackCard';
import { ErrorHuntCard } from './cards/ErrorHuntCard';
import { DetectiveCard } from './cards/DetectiveCard';
import { ManualReviewCard } from './cards/ManualReviewCard';
import { SocraticCard } from './cards/SocraticCard';
import { FlashcardCard } from './cards/FlashcardCard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export const CARD_COMPONENTS: Record<ContentType, any> = {
  keypoints: KeyPointsCard,
  must_know: MustKnowCard,
  quiz: QuizCard,
  story: StoryCard,
  mnemonic: MnemonicCard,
  teach_back: TeachBackCard,
  error_hunt: ErrorHuntCard,
  detective: DetectiveCard,
  manual: ManualReviewCard,
  socratic: SocraticCard,
  flashcards: FlashcardCard,
};
