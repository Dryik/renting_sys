/**
 * Types for the rehearsal's environment guard, so the vitest suite can hold
 * the decision rules to account without the module being rewritten in
 * TypeScript. The scripts directory runs under plain Node and is deliberately
 * outside the typechecked program.
 */
export declare const disposableMarker: { readonly name: string; readonly value: string };
export declare const disposableMarkerFileName: string;
export declare const productUserDataDirectoryName: string;
export declare const updaterCacheDirectoryName: string;
export declare const installedProgramDirectoryName: string;

export type RehearsalEnvironmentProbe = {
  platform: string;
  markerValue: string | undefined;
  isGithubHostedRunner: boolean;
  isWindowsSandbox: boolean;
  hasDisposableMarkerFile: boolean;
  markerFilePath: string;
  productUserDataPath: string;
  hasProductUserData: boolean;
  installedProgramPath: string;
  hasInstalledProgram: boolean;
  updaterCachePath: string;
  hasUpdaterCache: boolean;
};

export declare function decideEnvironment(probe: RehearsalEnvironmentProbe): {
  allowed: boolean;
  refusals: string[];
  signals: string[];
};

export declare function probeEnvironment(
  env?: NodeJS.ProcessEnv,
  platform?: string,
): RehearsalEnvironmentProbe;

export declare function assertDisposableEnvironment(probe?: RehearsalEnvironmentProbe): {
  probe: RehearsalEnvironmentProbe;
  decision: { allowed: boolean; refusals: string[]; signals: string[] };
};
