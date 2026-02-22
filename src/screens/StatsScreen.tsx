import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, ContributionGraph } from 'react-native-chart-kit';
import { getActivityHistory, getDailyLog } from '../db/queries/progress';
import { getAllSubjects, getAllTopicsWithProgress } from '../db/queries/topics';
import LoadingOrb from '../components/LoadingOrb';

const screenWidth = Dimensions.get('window').width;

export default function StatsScreen() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [subjectData, setSubjectData] = useState<any[]>([]);

  useEffect(() => {
    const data = getActivityHistory(90);
    setHistory(data.map(d => ({ date: d.date, count: d.totalMinutes })));
    
    const subjects = getAllSubjects();
    const topics = getAllTopicsWithProgress();
    
    const chartData = subjects.map(s => {
      const subTopics = topics.filter(t => t.subjectId === s.id);
      const mastered = subTopics.filter(t => t.progress.status === 'mastered').length;
      return {
        name: s.shortCode,
        mastered,
        total: subTopics.length || 1
      };
    }).sort((a,b) => b.mastered - a.mastered).slice(0, 5); // top 5 subjects
    
    setSubjectData(chartData);
    setLoading(false);
  }, []);

  if (loading) return <LoadingOrb message="Loading Stats..." />;

  const chartConfig = {
    backgroundColor: '#0F0F14',
    backgroundGradientFrom: '#1A1A24',
    backgroundGradientTo: '#1A1A24',
    color: (opacity = 1) => `rgba(108, 99, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    strokeWidth: 2,
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Study Consistency (Last 90 Days)</Text>
        <ContributionGraph
          values={history}
          endDate={new Date()}
          numDays={90}
          width={screenWidth - 32}
          height={220}
          chartConfig={chartConfig}
          style={styles.chart}
          tooltipDataAttrs={() => ({})}
          
        />

        <Text style={styles.title}>Top 5 Mastered Subjects</Text>
        <LineChart
          data={{
            labels: subjectData.map(s => s.name),
            datasets: [{ data: subjectData.map(s => (s.mastered / s.total) * 100) }]
          }}
          width={screenWidth - 32}
          height={220}
          yAxisSuffix="%"
          chartConfig={chartConfig}
          style={styles.chart}
          bezier
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  container: { padding: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12, marginTop: 16 },
  chart: { borderRadius: 16, marginVertical: 8 }
});
