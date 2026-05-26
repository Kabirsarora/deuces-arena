# Machine Learning Experiments

Future home for self-play scripts, simulation result exports, model evaluation, supervised datasets, reinforcement learning experiments, and AI coach analysis pipelines.

Do not fake AI here. Early bots should be clearly labeled as baseline bots; stronger recommendations should come from simulations, replay data, or trained/evaluated models.

Current support starts with random self-play sample generation, engine-level random rollout evaluation, and JSONL export of persisted coach move evaluations. The output is useful as a schema and pipeline starting point, not as strong strategy data.

```bash
COACH_EVALUATION_EXPORT_PATH=artifacts/coach-evaluations.jsonl npm run export:coach-evaluations --workspace @deuces-arena/ml
```
