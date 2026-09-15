import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

import { type ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type WorkspaceCommandRunner } from 'src/database/commands/command-runners/workspace.command-runner';
import { INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY } from 'src/engine/core-modules/upgrade/constants/instagram-2-20-upgrade-name-compatibility.constant';
import {
  TWENTY_ALL_VERSIONS,
  type TwentyAllVersion,
} from 'src/engine/core-modules/upgrade/constants/twenty-all-versions.constant';
import { TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS } from 'src/engine/core-modules/upgrade/constants/twenty-cross-upgrade-supported-version.constant';
import { TWENTY_CURRENT_VERSION } from 'src/engine/core-modules/upgrade/constants/twenty-current-version.constant';
import { TWENTY_NEXT_VERSIONS } from 'src/engine/core-modules/upgrade/constants/twenty-next-versions.constant';
import { TWENTY_PREVIOUS_VERSIONS } from 'src/engine/core-modules/upgrade/constants/twenty-previous-versions.constant';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';
import { type SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';
import { isDefined } from 'twenty-shared/utils';

type WorkspaceCommand =
  | WorkspaceCommandRunner
  | ActiveOrSuspendedWorkspaceCommandRunner;

export type RegisteredFastInstanceCommand = {
  name: string;
  command: FastInstanceCommand;
  version: TwentyAllVersion;
  timestamp: number;
};

export type RegisteredSlowInstanceCommand = {
  name: string;
  command: SlowInstanceCommand;
  version: TwentyAllVersion;
  timestamp: number;
};

export type RegisteredWorkspaceCommand = {
  name: string;
  command: WorkspaceCommand;
  version: TwentyAllVersion;
  timestamp: number;
};

type VersionBundle = {
  fastInstanceCommands: RegisteredFastInstanceCommand[];
  slowInstanceCommands: RegisteredSlowInstanceCommand[];
  workspaceCommands: RegisteredWorkspaceCommand[];
};

const buildEmptyVersionBundle = (): VersionBundle => ({
  fastInstanceCommands: [],
  slowInstanceCommands: [],
  workspaceCommands: [],
});

@Injectable()
export class UpgradeCommandRegistryService implements OnModuleInit {
  private readonly logger = new Logger(UpgradeCommandRegistryService.name);

  private readonly bundlesByVersion = new Map<
    TwentyAllVersion,
    VersionBundle
  >();

  constructor(private readonly discoveryService: DiscoveryService) {}

  onModuleInit(): void {
    this.validateInstagramNameCompatibility();

    for (const version of TWENTY_ALL_VERSIONS) {
      this.bundlesByVersion.set(version, {
        fastInstanceCommands: [],
        slowInstanceCommands: [],
        workspaceCommands: [],
      });
    }

    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const { instance, metatype } = wrapper;

      if (!instance || !metatype) {
        continue;
      }

      const instanceCommandMetadata =
        getRegisteredInstanceCommandMetadata(metatype);

      if (isDefined(instanceCommandMetadata)) {
        const name = this.resolveCommandName(
          instanceCommandMetadata.version,
          `${instanceCommandMetadata.type}-instance`,
          (instance as FastInstanceCommand).constructor.name,
          instanceCommandMetadata.timestamp,
        );
        const bundle = this.bundlesByVersion.get(
          instanceCommandMetadata.version,
        );

        if (!isDefined(bundle)) {
          continue;
        }

        const entry = {
          name,
          version: instanceCommandMetadata.version,
          timestamp: instanceCommandMetadata.timestamp,
        };

        if (instanceCommandMetadata.type === 'slow') {
          bundle.slowInstanceCommands.push({
            ...entry,
            command: instance as SlowInstanceCommand,
          });
        } else {
          bundle.fastInstanceCommands.push({
            ...entry,
            command: instance as FastInstanceCommand,
          });
        }

        continue;
      }

      const workspaceCommandMetadata =
        getRegisteredWorkspaceCommandMetadata(metatype);

      if (isDefined(workspaceCommandMetadata)) {
        const name = this.resolveCommandName(
          workspaceCommandMetadata.version,
          'workspace',
          (instance as WorkspaceCommand).constructor.name,
          workspaceCommandMetadata.timestamp,
        );
        const bundle = this.bundlesByVersion.get(
          workspaceCommandMetadata.version,
        );

        if (!isDefined(bundle)) {
          continue;
        }

        bundle.workspaceCommands.push({
          name,
          command: instance as WorkspaceCommand,
          version: workspaceCommandMetadata.version,
          timestamp: workspaceCommandMetadata.timestamp,
        });
      }
    }

    for (const [, bundle] of this.bundlesByVersion) {
      bundle.fastInstanceCommands.sort(
        (entryA, entryB) => entryA.timestamp - entryB.timestamp,
      );
      bundle.slowInstanceCommands.sort(
        (entryA, entryB) => entryA.timestamp - entryB.timestamp,
      );
      bundle.workspaceCommands.sort(
        (entryA, entryB) => entryA.timestamp - entryB.timestamp,
      );
    }

    this.validateNoVersionDuplicatesAcrossConstants();
    this.validatePreviousVersionsNotEmpty();
    this.validateNoDuplicates();
    this.validateAtLeastOneVersionBundleHasWorkspaceCommands();

    for (const [version, bundle] of this.bundlesByVersion) {
      const totalCount =
        bundle.fastInstanceCommands.length +
        bundle.slowInstanceCommands.length +
        bundle.workspaceCommands.length;

      if (totalCount > 0) {
        const crossUpgradeLabel = (
          TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS as readonly string[]
        ).includes(version)
          ? 'cross-upgrade supported'
          : 'pre-release';

        this.logger.log(
          `Registered ${bundle.fastInstanceCommands.length} fast instance, ${bundle.slowInstanceCommands.length} slow instance, and ${bundle.workspaceCommands.length} workspace command(s) for ${version} (${crossUpgradeLabel})`,
        );
      }
    }
  }

  getBundleForVersion(version: TwentyAllVersion): VersionBundle {
    return this.bundlesByVersion.get(version) ?? buildEmptyVersionBundle();
  }

  getLastWorkspaceCommandForVersion(
    version: TwentyAllVersion,
  ): RegisteredWorkspaceCommand | undefined {
    const bundle = this.getBundleForVersion(version);

    return bundle.workspaceCommands[bundle.workspaceCommands.length - 1];
  }

  getCrossUpgradeSupportedFastInstanceCommands(): RegisteredFastInstanceCommand[] {
    return TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS.flatMap(
      (version) => this.getBundleForVersion(version).fastInstanceCommands,
    );
  }

  getCrossUpgradeSupportedSlowInstanceCommands(): RegisteredSlowInstanceCommand[] {
    return TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS.flatMap(
      (version) => this.getBundleForVersion(version).slowInstanceCommands,
    );
  }

  private computeCommandName(
    version: TwentyAllVersion,
    className: string,
    timestamp: number,
  ): string {
    return `${version}_${className}_${timestamp}`;
  }

  private resolveCommandName(
    version: TwentyAllVersion,
    kind: 'fast-instance' | 'slow-instance' | 'workspace',
    className: string,
    timestamp: number,
  ): string {
    const sourceName = this.computeCommandName(version, className, timestamp);
    const compatibility = INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY.find(
      (entry) => entry.className === className,
    );

    if (!isDefined(compatibility)) {
      return sourceName;
    }

    // Reserved providers must fail before unsupported-version discovery skips.
    if (
      compatibility.version !== version ||
      compatibility.kind !== kind ||
      compatibility.timestamp !== timestamp
    ) {
      throw new Error(
        `Invalid Instagram upgrade provider "${sourceName}" (${kind})`,
      );
    }

    return compatibility.durableName;
  }

  private validateInstagramNameCompatibility(): void {
    const entries = INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY;
    const oldTimestamps = [
      1799201000000, 1799201001000, 1799201002000, 1799201003000, 1799201004000,
      1799201011000, 1799201011500, 1799201012000,
    ];
    const sourceNames = new Set<string>();
    const durableNames = new Set<string>();
    const classNames = new Set<string>();

    if (entries.length !== 8 || !TWENTY_ALL_VERSIONS.includes('2.20.0')) {
      throw new Error('Invalid Instagram upgrade compatibility configuration');
    }

    for (const [index, entry] of entries.entries()) {
      const sourceName = this.computeCommandName(
        entry.version,
        entry.className,
        entry.timestamp,
      );
      const expectedKind =
        index < 4
          ? 'fast-instance'
          : index === 4
            ? 'slow-instance'
            : 'workspace';

      if (
        entry.version !== '2.20.0' ||
        entry.kind !== expectedKind ||
        !/^[A-Za-z_$][\w$]*$/.test(entry.className) ||
        !Number.isSafeInteger(entry.timestamp) ||
        entry.timestamp <= 0 ||
        entry.durableName !==
          this.computeCommandName(
            entry.version,
            entry.className,
            oldTimestamps[index],
          ) ||
        sourceNames.has(sourceName) ||
        durableNames.has(entry.durableName) ||
        classNames.has(entry.className)
      ) {
        throw new Error('Invalid Instagram upgrade compatibility entry');
      }

      sourceNames.add(sourceName);
      durableNames.add(entry.durableName);
      classNames.add(entry.className);
    }

    if ([...sourceNames].some((name) => durableNames.has(name))) {
      throw new Error(
        'Instagram upgrade compatibility source and durable identities must be disjoint',
      );
    }
  }

  private validateNoDuplicates(): void {
    for (const [version, bundle] of this.bundlesByVersion) {
      this.validateNoTimestampDuplicatesWithinKind(
        version,
        'fast-instance',
        bundle.fastInstanceCommands,
      );
      this.validateNoTimestampDuplicatesWithinKind(
        version,
        'slow-instance',
        bundle.slowInstanceCommands,
      );
      this.validateNoTimestampDuplicatesWithinKind(
        version,
        'workspace',
        bundle.workspaceCommands,
      );

      const seenNames = new Set<string>();

      const allNames = [
        ...bundle.fastInstanceCommands.map((entry) => entry.name),
        ...bundle.slowInstanceCommands.map((entry) => entry.name),
        ...bundle.workspaceCommands.map((entry) => entry.name),
      ];

      for (const name of allNames) {
        if (seenNames.has(name)) {
          throw new Error(
            `Duplicate upgrade command name "${name}" in version ${version}`,
          );
        }

        seenNames.add(name);
      }
    }
  }

  private validateAtLeastOneVersionBundleHasWorkspaceCommands(): void {
    let hasWorkspaceCommands = false;

    for (const version of TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS) {
      const bundle = this.getBundleForVersion(version);

      if (bundle.workspaceCommands.length > 0) {
        hasWorkspaceCommands = true;
      }
    }

    if (!hasWorkspaceCommands) {
      throw new Error(
        'Upgrade sequence must contain at least one workspace command',
      );
    }
  }

  private validateNoTimestampDuplicatesWithinKind(
    version: TwentyAllVersion,
    kind: 'fast-instance' | 'slow-instance' | 'workspace',
    entries:
      | RegisteredFastInstanceCommand[]
      | RegisteredSlowInstanceCommand[]
      | RegisteredWorkspaceCommand[],
  ): void {
    const seenTimestamps = new Set<number>();

    for (const entry of entries) {
      if (seenTimestamps.has(entry.timestamp)) {
        throw new Error(
          `Duplicate ${kind} command timestamp ${entry.timestamp} in version ${version} (command: ${entry.name})`,
        );
      }

      seenTimestamps.add(entry.timestamp);
    }
  }

  private validateNoVersionDuplicatesAcrossConstants(): void {
    const allVersions = [
      ...TWENTY_PREVIOUS_VERSIONS,
      TWENTY_CURRENT_VERSION,
      ...TWENTY_NEXT_VERSIONS,
    ];

    const uniqueVersions = new Set(allVersions);

    if (uniqueVersions.size !== allVersions.length) {
      const duplicates = allVersions.filter(
        (version, index) => allVersions.indexOf(version) !== index,
      );

      throw new Error(
        `Duplicate version(s) across TWENTY_PREVIOUS_VERSIONS, TWENTY_CURRENT_VERSION, and TWENTY_NEXT_VERSIONS: ${duplicates.join(', ')}`,
      );
    }
  }

  private validatePreviousVersionsNotEmpty(): void {
    if ((TWENTY_PREVIOUS_VERSIONS as readonly string[]).length === 0) {
      throw new Error(
        'TWENTY_PREVIOUS_VERSIONS must contain at least one version before TWENTY_CURRENT_VERSION',
      );
    }
  }
}
