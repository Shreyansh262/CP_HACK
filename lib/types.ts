export type Hint = {
  level: 1 | 2 | 3;
  text: string;
};

export type Problem = {
  id: string;
  source: string;
  external_id: string | null;
  title: string;
  problem_statement: string;
  difficulty: string | null;
  tags: string[] | null;
  hints: Hint[];
  edge_cases: string[] | null;
  created_at: string;
};

export type ProblemListItem = Pick<
  Problem,
  'id' | 'external_id' | 'title' | 'difficulty' | 'tags'
>;