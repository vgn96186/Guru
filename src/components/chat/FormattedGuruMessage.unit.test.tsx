import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { FormattedGuruMessage } from './FormattedGuruMessage';
import { linearTheme as n } from '../../theme/linearTheme';

describe('FormattedGuruMessage', () => {
  it('renders markdown-like content without exposing raw heading and list markers', () => {
    const { queryByText } = render(
      <FormattedGuruMessage
        text={'## Overview\n\n- First point\n- Second point\n\n**Bold** closing line'}
      />,
    );

    expect(queryByText('Overview')).toBeTruthy();
    expect(queryByText('First point')).toBeTruthy();
    expect(queryByText('Second point')).toBeTruthy();
    expect(queryByText('## Overview')).toBeNull();
    expect(queryByText('- First point')).toBeNull();
  });

  it('renders deeper markdown headings without exposing raw hash markers', () => {
    const { queryByText } = render(
      <FormattedGuruMessage text={'#### Key takeaways\n\nFollow-up explanation'} />,
    );

    expect(queryByText('Key takeaways')).toBeTruthy();
    expect(queryByText('#### Key takeaways')).toBeNull();
  });

  it('renders markdown tables as readable cells instead of raw pipe rows', () => {
    const { queryByText } = render(
      <FormattedGuruMessage
        text={'| Column | Value |\n| --- | --- |\n| Stage | Review |\n| Score | 92% |'}
      />,
    );

    expect(queryByText('Column')).toBeTruthy();
    expect(queryByText('Value')).toBeTruthy();
    expect(queryByText('Stage')).toBeTruthy();
    expect(queryByText('Review')).toBeTruthy();
    expect(queryByText('Score')).toBeTruthy();
    expect(queryByText('92%')).toBeTruthy();
    expect(queryByText('| Column | Value |')).toBeNull();
    expect(queryByText('| Stage | Review |')).toBeNull();
  });

  it('hides divider markers and normalizes latex-style arrows in prose', () => {
    const { queryByText } = render(
      <FormattedGuruMessage
        text={'---\n\nSequence: Rolling $\\rightarrow$ Adhesion $\\rightarrow$ Chemotaxis'}
      />,
    );

    expect(queryByText('---')).toBeNull();
    expect(queryByText(/Sequence: Rolling → Adhesion → Chemotaxis/)).toBeTruthy();
    expect(queryByText(/\\rightarrow/)).toBeNull();
  });

  it('renders explicit topic and high-yield markers without exposing raw marker syntax', () => {
    const { getByText, queryByText } = render(
      <FormattedGuruMessage
        text={'## ==Inflammation==\n\nRemember ==Acute Inflammation== is driven by !!C5a!!'}
      />,
    );

    const heading = getByText('Inflammation');
    const topic = getByText('Acute Inflammation');
    const highYield = getByText('C5a');

    expect(queryByText('==Inflammation==')).toBeNull();
    expect(queryByText('==Acute Inflammation==')).toBeNull();
    expect(queryByText('!!C5a!!')).toBeNull();
    expect(StyleSheet.flatten(heading.props.style)).toEqual(
      expect.objectContaining({ color: n.colors.accent }),
    );
    expect(StyleSheet.flatten(topic.props.style)).toEqual(
      expect.objectContaining({ color: n.colors.accent }),
    );
    expect(StyleSheet.flatten(highYield.props.style)).toEqual(
      expect.objectContaining({ color: '#FB923C' }),
    );
  });
});
