import { Project } from '@codex/shared';

/** Strip server filesystem paths before sending a project to the browser. */
export function toPublicProject(project: Project): Project {
  const clone: Project = JSON.parse(JSON.stringify(project));
  delete clone.path;
  if (clone.model?.files) {
    clone.model.files.projectRoot = '.';
  }
  return clone;
}
