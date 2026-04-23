import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type ParamListBase,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type {
  ChatStackParamList,
  HomeStackParamList,
  MenuStackParamList,
  RootStackParamList,
  SyllabusStackParamList,
  TabParamList,
} from './types';

/**
 * Per-stack typed navigation/route hook bundle.
 *
 * Replaces the repeated boilerplate:
 *   type Nav = NativeStackNavigationProp<HomeStackParamList, 'ManualLog'>;
 *   type Route = RouteProp<HomeStackParamList, 'ManualLog'>;
 *   const navigation = useNavigation<Nav>();
 *   const route = useRoute<Route>();
 *
 * With:
 *   const navigation = HomeNav.useNav<'ManualLog'>();
 *   const route = HomeNav.useRoute<'ManualLog'>();
 *
 * Omit the generic to get the whole stack type (equivalent to
 * NativeStackNavigationProp<HomeStackParamList>):
 *   const navigation = HomeNav.useNav();
 */
function makeStackHooks<ParamList extends ParamListBase>() {
  return {
    useNav: <S extends keyof ParamList = keyof ParamList>() =>
      useNavigation<NativeStackNavigationProp<ParamList, S & string>>(),
    useRoute: <S extends keyof ParamList>() =>
      useRoute<RouteProp<ParamList, S & string>>(),
  };
}

/** Access the parent Tabs navigator from any nested stack screen. */
export function useTabsNav() {
  const nav = useNavigation();
  return nav.getParent<NavigationProp<TabParamList>>();
}

export const HomeNav = makeStackHooks<HomeStackParamList>();
export const SyllabusNav = makeStackHooks<SyllabusStackParamList>();
export const ChatNav = makeStackHooks<ChatStackParamList>();
export const MenuNav = makeStackHooks<MenuStackParamList>();
export const RootNav = makeStackHooks<RootStackParamList>();
