import type { Skill } from './types.ts'

const DELIMITERS = /[,，、;；。\s]+/

export function scoreSkillMatch(skill: Skill, task: string): number {
  const normalizedTask = task.toLowerCase()
  let score = 0

  const whenToUse = skill.whenToUse.toLowerCase()
  const phrases = whenToUse
    .split(DELIMITERS)
    .filter((phrase) => phrase.length >= 4)
    .sort((a, b) => b.length - a.length)
  for (const phrase of phrases) {
    if (normalizedTask.includes(phrase)) score += 3
  }

  for (const keyword of skill.loadWhen.keywords) {
    const kw = keyword.toLowerCase()
    if (kw.length >= 2 && normalizedTask.includes(kw)) score += 2
  }

  for (const taskType of skill.loadWhen.taskTypes) {
    const tt = taskType.toLowerCase()
    if (tt.length >= 2 && normalizedTask.includes(tt)) score += 2
  }

  return score
}
