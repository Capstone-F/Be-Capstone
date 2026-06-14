import { ConflictSeverity } from '../../products/enums/conflict-severity.enum';
import { AppDataSource } from '../data-source';
import { IngredientConflict } from '../../ingredients/ingredient-conflict.entity';
import { Ingredient } from '../../ingredients/ingredient.entity';
import { GoalIngredient } from '../../treatment-goals/goal-ingredient.entity';
import { TreatmentGoal } from '../../treatment-goals/treatment-goal.entity';

type GoalSeed = {
  code: string;
  name: string;
  description: string;
};

type IngredientSeed = {
  name: string;
  ingredientType: string;
  isActiveIngredient: boolean;
  description?: string;
};

const TREATMENT_GOALS: GoalSeed[] = [
  {
    code: 'reduce_acne',
    name: 'Reduce Acne',
    description: 'Target breakouts and blemishes',
  },
  {
    code: 'anti_aging',
    name: 'Anti-Aging',
    description: 'Reduce fine lines and improve skin elasticity',
  },
  {
    code: 'reduce_pigmentation',
    name: 'Reduce Pigmentation',
    description: 'Even skin tone and fade dark spots',
  },
  {
    code: 'repair_barrier',
    name: 'Repair Barrier',
    description: 'Strengthen the skin moisture barrier',
  },
  {
    code: 'hydration',
    name: 'Hydration',
    description: 'Boost moisture retention and plumpness',
  },
];

const INGREDIENTS: IngredientSeed[] = [
  {
    name: 'Niacinamide',
    ingredientType: 'vitamin',
    isActiveIngredient: true,
    description: 'Vitamin B3; helps regulate sebum and even tone',
  },
  {
    name: 'Retinol',
    ingredientType: 'retinoid',
    isActiveIngredient: true,
    description: 'Vitamin A derivative for cell turnover',
  },
  {
    name: 'Salicylic Acid',
    ingredientType: 'bha',
    isActiveIngredient: true,
    description: 'Beta hydroxy acid for pore clearing',
  },
  {
    name: 'Ceramide',
    ingredientType: 'lipid',
    isActiveIngredient: false,
    description: 'Barrier-repair lipid',
  },
  {
    name: 'Hyaluronic Acid',
    ingredientType: 'humectant',
    isActiveIngredient: false,
    description: 'Hydrating humectant',
  },
  {
    name: 'Glycolic Acid',
    ingredientType: 'aha',
    isActiveIngredient: true,
    description: 'Alpha hydroxy acid for exfoliation',
  },
  {
    name: 'Azelaic Acid',
    ingredientType: 'dicarboxylic_acid',
    isActiveIngredient: true,
    description: 'Anti-inflammatory; helps acne and redness',
  },
  {
    name: 'Benzoyl Peroxide',
    ingredientType: 'antimicrobial',
    isActiveIngredient: true,
    description: 'Antibacterial agent for acne',
  },
];

const GOAL_INGREDIENT_MAPPINGS: Array<{
  goalCode: string;
  ingredientName: string;
  priorityScore: number;
}> = [
  {
    goalCode: 'reduce_acne',
    ingredientName: 'Salicylic Acid',
    priorityScore: 90,
  },
  {
    goalCode: 'reduce_acne',
    ingredientName: 'Azelaic Acid',
    priorityScore: 85,
  },
  { goalCode: 'reduce_acne', ingredientName: 'Niacinamide', priorityScore: 75 },
  { goalCode: 'anti_aging', ingredientName: 'Retinol', priorityScore: 95 },
  { goalCode: 'anti_aging', ingredientName: 'Niacinamide', priorityScore: 70 },
  {
    goalCode: 'reduce_pigmentation',
    ingredientName: 'Azelaic Acid',
    priorityScore: 90,
  },
  {
    goalCode: 'reduce_pigmentation',
    ingredientName: 'Niacinamide',
    priorityScore: 80,
  },
  {
    goalCode: 'reduce_pigmentation',
    ingredientName: 'Glycolic Acid',
    priorityScore: 75,
  },
  { goalCode: 'repair_barrier', ingredientName: 'Ceramide', priorityScore: 95 },
  {
    goalCode: 'repair_barrier',
    ingredientName: 'Niacinamide',
    priorityScore: 70,
  },
  {
    goalCode: 'hydration',
    ingredientName: 'Hyaluronic Acid',
    priorityScore: 95,
  },
  { goalCode: 'hydration', ingredientName: 'Ceramide', priorityScore: 80 },
];

const INGREDIENT_CONFLICTS: Array<{
  ingredientA: string;
  ingredientB: string;
  severity: ConflictSeverity;
  reason: string;
}> = [
  {
    ingredientA: 'Retinol',
    ingredientB: 'Glycolic Acid',
    severity: ConflictSeverity.HIGH,
    reason: 'Retinol + AHA may cause excessive irritation',
  },
  {
    ingredientA: 'Retinol',
    ingredientB: 'Salicylic Acid',
    severity: ConflictSeverity.MEDIUM,
    reason: 'Combining retinol with BHA may increase dryness',
  },
  {
    ingredientA: 'Retinol',
    ingredientB: 'Benzoyl Peroxide',
    severity: ConflictSeverity.HIGH,
    reason: 'Benzoyl peroxide can deactivate retinol',
  },
];

function normalizePair(aId: string, bId: string): [string, string] {
  return aId < bId ? [aId, bId] : [bId, aId];
}

async function upsertGoal(
  repo: ReturnType<typeof AppDataSource.getRepository<TreatmentGoal>>,
  seed: GoalSeed,
): Promise<TreatmentGoal> {
  let goal = await repo.findOneBy({ code: seed.code });
  if (!goal) {
    goal = repo.create(seed);
    return repo.save(goal);
  }
  goal.name = seed.name;
  goal.description = seed.description;
  return repo.save(goal);
}

async function upsertIngredient(
  repo: ReturnType<typeof AppDataSource.getRepository<Ingredient>>,
  seed: IngredientSeed,
): Promise<Ingredient> {
  let ingredient = await repo.findOneBy({ name: seed.name });
  if (!ingredient) {
    ingredient = repo.create(seed);
    return repo.save(ingredient);
  }
  ingredient.ingredientType = seed.ingredientType;
  ingredient.isActiveIngredient = seed.isActiveIngredient;
  ingredient.description = seed.description ?? null;
  return repo.save(ingredient);
}

async function seed(): Promise<void> {
  await AppDataSource.initialize();

  const goalRepo = AppDataSource.getRepository(TreatmentGoal);
  const ingredientRepo = AppDataSource.getRepository(Ingredient);
  const goalIngredientRepo = AppDataSource.getRepository(GoalIngredient);
  const conflictRepo = AppDataSource.getRepository(IngredientConflict);

  const goalsByCode = new Map<string, TreatmentGoal>();
  for (const goalSeed of TREATMENT_GOALS) {
    const goal = await upsertGoal(goalRepo, goalSeed);
    goalsByCode.set(goal.code, goal);
  }

  const ingredientsByName = new Map<string, Ingredient>();
  for (const ingredientSeed of INGREDIENTS) {
    const ingredient = await upsertIngredient(ingredientRepo, ingredientSeed);
    ingredientsByName.set(ingredient.name, ingredient);
  }

  for (const mapping of GOAL_INGREDIENT_MAPPINGS) {
    const goal = goalsByCode.get(mapping.goalCode);
    const ingredient = ingredientsByName.get(mapping.ingredientName);
    if (!goal || !ingredient) {
      continue;
    }

    const existing = await goalIngredientRepo.findOneBy({
      goalId: goal.id,
      ingredientId: ingredient.id,
    });
    if (!existing) {
      await goalIngredientRepo.save(
        goalIngredientRepo.create({
          goalId: goal.id,
          ingredientId: ingredient.id,
          priorityScore: mapping.priorityScore,
        }),
      );
    } else {
      existing.priorityScore = mapping.priorityScore;
      await goalIngredientRepo.save(existing);
    }
  }

  for (const conflict of INGREDIENT_CONFLICTS) {
    const ingredientA = ingredientsByName.get(conflict.ingredientA);
    const ingredientB = ingredientsByName.get(conflict.ingredientB);
    if (!ingredientA || !ingredientB) {
      continue;
    }

    const [aId, bId] = normalizePair(ingredientA.id, ingredientB.id);
    const existing = await conflictRepo.findOneBy({
      ingredientAId: aId,
      ingredientBId: bId,
    });
    if (!existing) {
      await conflictRepo.save(
        conflictRepo.create({
          ingredientAId: aId,
          ingredientBId: bId,
          severity: conflict.severity,
          reason: conflict.reason,
        }),
      );
    } else {
      existing.severity = conflict.severity;
      existing.reason = conflict.reason;
      await conflictRepo.save(existing);
    }
  }

  console.log('Seed completed successfully');
  await AppDataSource.destroy();
}

seed().catch((err: unknown) => {
  console.error('Seed failed', err);
  void AppDataSource.destroy();
  process.exit(1);
});
