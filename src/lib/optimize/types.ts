import { PromptTemplate } from '../prompts';

/** Training example tuple. */
export interface TrainExample<I = any, O = any> {
  input: I;
  output: O;
}

/** Metric: returns single scalar; higher is better. */
export type MetricFn<P = any, G = any> = (prediction: P, gold: G) => number | Promise<number>;

/** Every optimiser returns a tuned clone of the target. */
export interface OptimizerSpec<T = PromptTemplate<any, any>> {
  run(target: T): Promise<T>;
}