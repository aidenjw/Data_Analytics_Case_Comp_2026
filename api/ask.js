const { handle } = require("./_lib/http");
const { buildPlan, summarizeAnswer } = require("./_lib/assistant");
const { rpc } = require("./_lib/supabase");

async function runPlan(plan) {
  const filters = {
    ...plan.filters,
    groupBy: plan.groupBy,
    grain: plan.grain,
    limit: plan.limit,
  };
  if (plan.intent === "trend") {
    const result = await rpc("dashboard_trends", { filters });
    return result.items ?? [];
  }
  if (plan.intent === "geography") {
    const result = await rpc("dashboard_geography", { filters });
    return result.items ?? [];
  }
  if (plan.intent === "project_search") {
    const result = await rpc("dashboard_project_search", { filters });
    return result.items ?? [];
  }
  const result = await rpc("dashboard_rankings", { filters });
  return result.items ?? [];
}

module.exports = (request, response) =>
  handle(request, response, "POST", async ({ question }) => {
    const metadata = await rpc("dashboard_metadata");
    const plan = await buildPlan(question, metadata);
    const items = await runPlan(plan);
    return {
      question,
      answer: summarizeAnswer(plan.intent, plan.filters.metric, items),
      chartType: plan.chartType,
      plan: {
        intent: plan.intent,
        metric: plan.filters.metric,
        groupBy: plan.groupBy,
        grain: plan.grain,
        filters: plan.filters,
        confidence: plan.confidence,
        planner: plan.planner,
      },
      interpretation: plan.interpretation,
      context: plan.context,
      items,
    };
  });
