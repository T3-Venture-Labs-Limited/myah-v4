export default {
    "scalars": [
        1,
        3,
        4,
        6,
        7,
        9,
        12,
        13,
        15,
        18,
        21,
        22,
        23,
        24,
        36,
        37,
        42,
        44,
        46,
        48,
        57,
        59,
        61,
        64,
        67,
        68,
        69,
        70,
        71,
        73,
        74,
        77,
        78,
        83,
        86,
        91,
        92,
        95,
        96,
        98,
        101,
        102,
        108,
        122,
        130,
        131,
        132,
        134,
        143,
        161,
        163,
        167,
        168,
        169,
        170,
        171,
        172,
        173,
        180,
        185,
        188,
        190,
        194,
        213,
        235,
        238,
        242,
        243,
        258,
        262,
        317,
        320,
        323,
        347,
        349,
        390,
        391,
        392,
        393,
        395,
        397,
        420,
        428,
        429,
        432,
        443,
        444,
        588
    ],
    "types": {
        "BillingProductDTO": {
            "name": [
                1
            ],
            "description": [
                1
            ],
            "images": [
                1
            ],
            "metadata": [
                129
            ],
            "on_BillingLicensedProduct": [
                138
            ],
            "on_BillingMeteredProduct": [
                139
            ],
            "__typename": [
                1
            ]
        },
        "String": {},
        "ApiKey": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "expiresAt": [
                4
            ],
            "revokedAt": [
                4
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "role": [
                29
            ],
            "__typename": [
                1
            ]
        },
        "UUID": {},
        "DateTime": {},
        "ApplicationRegistrationVariable": {
            "id": [
                3
            ],
            "key": [
                1
            ],
            "description": [
                1
            ],
            "isSecret": [
                6
            ],
            "isRequired": [
                6
            ],
            "type": [
                1
            ],
            "options": [
                7
            ],
            "isFilled": [
                6
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "Boolean": {},
        "JSON": {},
        "ApplicationRegistration": {
            "id": [
                3
            ],
            "universalIdentifier": [
                1
            ],
            "name": [
                1
            ],
            "oAuthClientId": [
                1
            ],
            "oAuthRedirectUris": [
                1
            ],
            "oAuthScopes": [
                1
            ],
            "ownerWorkspaceId": [
                3
            ],
            "sourceType": [
                9
            ],
            "sourcePackage": [
                1
            ],
            "latestAvailableVersion": [
                1
            ],
            "isListed": [
                6
            ],
            "isFeatured": [
                6
            ],
            "isPreInstalled": [
                6
            ],
            "logoUrl": [
                1
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "isConfigured": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "ApplicationRegistrationSourceType": {},
        "TwoFactorAuthenticationMethodSummary": {
            "twoFactorAuthenticationMethodId": [
                3
            ],
            "status": [
                1
            ],
            "strategy": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "RowLevelPermissionPredicateGroup": {
            "id": [
                1
            ],
            "parentRowLevelPermissionPredicateGroupId": [
                1
            ],
            "logicalOperator": [
                13
            ],
            "positionInRowLevelPermissionPredicateGroup": [
                12
            ],
            "roleId": [
                1
            ],
            "objectMetadataId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "Float": {},
        "RowLevelPermissionPredicateGroupLogicalOperator": {},
        "RowLevelPermissionPredicate": {
            "id": [
                1
            ],
            "fieldMetadataId": [
                1
            ],
            "objectMetadataId": [
                1
            ],
            "operand": [
                15
            ],
            "subFieldName": [
                1
            ],
            "workspaceMemberFieldMetadataId": [
                1
            ],
            "workspaceMemberSubFieldName": [
                1
            ],
            "rowLevelPermissionPredicateGroupId": [
                1
            ],
            "positionInRowLevelPermissionPredicateGroup": [
                12
            ],
            "roleId": [
                1
            ],
            "value": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "RowLevelPermissionPredicateOperand": {},
        "ObjectPermission": {
            "objectMetadataId": [
                3
            ],
            "canReadObjectRecords": [
                6
            ],
            "canUpdateObjectRecords": [
                6
            ],
            "canSoftDeleteObjectRecords": [
                6
            ],
            "canDestroyObjectRecords": [
                6
            ],
            "restrictedFields": [
                7
            ],
            "rowLevelPermissionPredicates": [
                14
            ],
            "rowLevelPermissionPredicateGroups": [
                11
            ],
            "__typename": [
                1
            ]
        },
        "UserWorkspace": {
            "id": [
                3
            ],
            "user": [
                76
            ],
            "userId": [
                3
            ],
            "locale": [
                1
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "deletedAt": [
                4
            ],
            "permissionFlags": [
                18
            ],
            "objectPermissions": [
                16
            ],
            "objectsPermissions": [
                16
            ],
            "twoFactorAuthenticationMethodSummary": [
                10
            ],
            "__typename": [
                1
            ]
        },
        "PermissionFlagType": {},
        "FullName": {
            "firstName": [
                1
            ],
            "lastName": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceMember": {
            "id": [
                3
            ],
            "name": [
                19
            ],
            "userEmail": [
                1
            ],
            "colorScheme": [
                1
            ],
            "avatarUrl": [
                1
            ],
            "locale": [
                1
            ],
            "calendarStartDay": [
                21
            ],
            "timeZone": [
                1
            ],
            "dateFormat": [
                22
            ],
            "timeFormat": [
                23
            ],
            "roles": [
                29
            ],
            "userWorkspaceId": [
                3
            ],
            "numberFormat": [
                24
            ],
            "__typename": [
                1
            ]
        },
        "Int": {},
        "WorkspaceMemberDateFormatEnum": {},
        "WorkspaceMemberTimeFormatEnum": {},
        "WorkspaceMemberNumberFormatEnum": {},
        "Agent": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "label": [
                1
            ],
            "icon": [
                1
            ],
            "description": [
                1
            ],
            "prompt": [
                1
            ],
            "modelId": [
                1
            ],
            "responseFormat": [
                7
            ],
            "roleId": [
                3
            ],
            "isCustom": [
                6
            ],
            "applicationId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "modelConfiguration": [
                7
            ],
            "evaluationInputs": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "FieldPermission": {
            "id": [
                3
            ],
            "objectMetadataId": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "roleId": [
                3
            ],
            "canReadFieldValue": [
                6
            ],
            "canUpdateFieldValue": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "RolePermissionFlag": {
            "id": [
                3
            ],
            "roleId": [
                3
            ],
            "flag": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ApiKeyForRole": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "expiresAt": [
                4
            ],
            "revokedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "Role": {
            "id": [
                3
            ],
            "universalIdentifier": [
                3
            ],
            "label": [
                1
            ],
            "description": [
                1
            ],
            "icon": [
                1
            ],
            "isEditable": [
                6
            ],
            "canBeAssignedToUsers": [
                6
            ],
            "canBeAssignedToAgents": [
                6
            ],
            "canBeAssignedToApiKeys": [
                6
            ],
            "workspaceMembers": [
                20
            ],
            "agents": [
                25
            ],
            "apiKeys": [
                28
            ],
            "canUpdateAllSettings": [
                6
            ],
            "canAccessAllTools": [
                6
            ],
            "canReadAllObjectRecords": [
                6
            ],
            "canUpdateAllObjectRecords": [
                6
            ],
            "canSoftDeleteAllObjectRecords": [
                6
            ],
            "canDestroyAllObjectRecords": [
                6
            ],
            "permissionFlags": [
                27
            ],
            "objectPermissions": [
                16
            ],
            "fieldPermissions": [
                26
            ],
            "rowLevelPermissionPredicates": [
                14
            ],
            "rowLevelPermissionPredicateGroups": [
                11
            ],
            "__typename": [
                1
            ]
        },
        "ApplicationRegistrationSummary": {
            "id": [
                3
            ],
            "latestAvailableVersion": [
                1
            ],
            "sourceType": [
                9
            ],
            "logoUrl": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ApplicationVariable": {
            "id": [
                3
            ],
            "key": [
                1
            ],
            "value": [
                1
            ],
            "description": [
                1
            ],
            "isSecret": [
                6
            ],
            "type": [
                1
            ],
            "options": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "AuthToken": {
            "token": [
                1
            ],
            "expiresAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "ApplicationTokenPair": {
            "applicationAccessToken": [
                32
            ],
            "applicationRefreshToken": [
                32
            ],
            "__typename": [
                1
            ]
        },
        "FrontComponent": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "description": [
                1
            ],
            "sourceComponentPath": [
                1
            ],
            "builtComponentPath": [
                1
            ],
            "componentName": [
                1
            ],
            "builtComponentChecksum": [
                1
            ],
            "universalIdentifier": [
                3
            ],
            "applicationId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "isHeadless": [
                6
            ],
            "usesSdkClient": [
                6
            ],
            "applicationTokenPair": [
                33
            ],
            "applicationVariables": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "CommandMenuItem": {
            "id": [
                3
            ],
            "workflowVersionId": [
                3
            ],
            "frontComponentId": [
                3
            ],
            "frontComponent": [
                34
            ],
            "engineComponentKey": [
                36
            ],
            "label": [
                1
            ],
            "icon": [
                1
            ],
            "shortLabel": [
                1
            ],
            "position": [
                12
            ],
            "isPinned": [
                6
            ],
            "availabilityType": [
                37
            ],
            "payload": [
                38
            ],
            "hotKeys": [
                1
            ],
            "conditionalAvailabilityExpression": [
                1
            ],
            "availabilityObjectMetadataId": [
                3
            ],
            "pageLayoutId": [
                3
            ],
            "universalIdentifier": [
                3
            ],
            "applicationId": [
                3
            ],
            "isActive": [
                6
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "EngineComponentKey": {},
        "CommandMenuItemAvailabilityType": {},
        "CommandMenuItemPayload": {
            "on_PathCommandMenuItemPayload": [
                39
            ],
            "on_ObjectMetadataCommandMenuItemPayload": [
                40
            ],
            "__typename": [
                1
            ]
        },
        "PathCommandMenuItemPayload": {
            "path": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ObjectMetadataCommandMenuItemPayload": {
            "objectMetadataItemId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "LogicFunction": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "description": [
                1
            ],
            "runtime": [
                1
            ],
            "timeoutSeconds": [
                12
            ],
            "executionMode": [
                42
            ],
            "sourceHandlerPath": [
                1
            ],
            "handlerName": [
                1
            ],
            "cronTriggerSettings": [
                7
            ],
            "databaseEventTriggerSettings": [
                7
            ],
            "httpRouteTriggerSettings": [
                7
            ],
            "toolTriggerSettings": [
                7
            ],
            "workflowActionTriggerSettings": [
                7
            ],
            "applicationId": [
                3
            ],
            "universalIdentifier": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "LogicFunctionExecutionMode": {},
        "Field": {
            "id": [
                3
            ],
            "universalIdentifier": [
                1
            ],
            "type": [
                44
            ],
            "name": [
                1
            ],
            "label": [
                1
            ],
            "description": [
                1
            ],
            "icon": [
                1
            ],
            "isActive": [
                6
            ],
            "isSystem": [
                6
            ],
            "isUIEditable": [
                6
            ],
            "isUIReadOnly": [
                6
            ],
            "isNullable": [
                6
            ],
            "isUnique": [
                6
            ],
            "defaultValue": [
                7
            ],
            "options": [
                7
            ],
            "settings": [
                7
            ],
            "objectMetadataId": [
                3
            ],
            "isLabelSyncedWithName": [
                6
            ],
            "morphId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "applicationId": [
                3
            ],
            "relation": [
                234
            ],
            "morphRelations": [
                234
            ],
            "object": [
                52
            ],
            "__typename": [
                1
            ]
        },
        "FieldMetadataType": {},
        "Index": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "isCustom": [
                6
            ],
            "isUnique": [
                6
            ],
            "indexWhereClause": [
                1
            ],
            "indexType": [
                46
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "indexFieldMetadataList": [
                196
            ],
            "objectMetadata": [
                201,
                {
                    "paging": [
                        47,
                        "CursorPaging!"
                    ],
                    "filter": [
                        49,
                        "ObjectFilter!"
                    ]
                }
            ],
            "__typename": [
                1
            ]
        },
        "IndexType": {},
        "CursorPaging": {
            "before": [
                48
            ],
            "after": [
                48
            ],
            "first": [
                21
            ],
            "last": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "ConnectionCursor": {},
        "ObjectFilter": {
            "and": [
                49
            ],
            "or": [
                49
            ],
            "id": [
                50
            ],
            "isRemote": [
                51
            ],
            "isActive": [
                51
            ],
            "isSystem": [
                51
            ],
            "isUIEditable": [
                51
            ],
            "isUICreatable": [
                51
            ],
            "isUIReadOnly": [
                51
            ],
            "isSearchable": [
                51
            ],
            "__typename": [
                1
            ]
        },
        "UUIDFilterComparison": {
            "is": [
                6
            ],
            "isNot": [
                6
            ],
            "eq": [
                3
            ],
            "neq": [
                3
            ],
            "gt": [
                3
            ],
            "gte": [
                3
            ],
            "lt": [
                3
            ],
            "lte": [
                3
            ],
            "like": [
                3
            ],
            "notLike": [
                3
            ],
            "iLike": [
                3
            ],
            "notILike": [
                3
            ],
            "in": [
                3
            ],
            "notIn": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "BooleanFieldComparison": {
            "is": [
                6
            ],
            "isNot": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "Object": {
            "id": [
                3
            ],
            "universalIdentifier": [
                1
            ],
            "nameSingular": [
                1
            ],
            "namePlural": [
                1
            ],
            "labelSingular": [
                1
            ],
            "labelPlural": [
                1
            ],
            "description": [
                1
            ],
            "icon": [
                1
            ],
            "shortcut": [
                1
            ],
            "color": [
                1
            ],
            "isRemote": [
                6
            ],
            "isActive": [
                6
            ],
            "isSystem": [
                6
            ],
            "isUIEditable": [
                6
            ],
            "isUICreatable": [
                6
            ],
            "isUIReadOnly": [
                6
            ],
            "isSearchable": [
                6
            ],
            "applicationId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "labelIdentifierFieldMetadataId": [
                3
            ],
            "imageIdentifierFieldMetadataId": [
                3
            ],
            "isLabelSyncedWithName": [
                6
            ],
            "duplicateCriteria": [
                1
            ],
            "fieldsList": [
                43
            ],
            "indexMetadataList": [
                45
            ],
            "searchFieldMetadataList": [
                203
            ],
            "fields": [
                207,
                {
                    "paging": [
                        47,
                        "CursorPaging!"
                    ],
                    "filter": [
                        53,
                        "FieldFilter!"
                    ]
                }
            ],
            "indexMetadatas": [
                205,
                {
                    "paging": [
                        47,
                        "CursorPaging!"
                    ],
                    "filter": [
                        54,
                        "IndexFilter!"
                    ]
                }
            ],
            "__typename": [
                1
            ]
        },
        "FieldFilter": {
            "and": [
                53
            ],
            "or": [
                53
            ],
            "id": [
                50
            ],
            "isActive": [
                51
            ],
            "isSystem": [
                51
            ],
            "isUIEditable": [
                51
            ],
            "isUIReadOnly": [
                51
            ],
            "objectMetadataId": [
                50
            ],
            "__typename": [
                1
            ]
        },
        "IndexFilter": {
            "and": [
                54
            ],
            "or": [
                54
            ],
            "id": [
                50
            ],
            "isCustom": [
                51
            ],
            "__typename": [
                1
            ]
        },
        "Application": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "description": [
                1
            ],
            "logo": [
                1
            ],
            "logoFileId": [
                3
            ],
            "version": [
                1
            ],
            "universalIdentifier": [
                1
            ],
            "packageJsonChecksum": [
                1
            ],
            "packageJsonFileId": [
                3
            ],
            "yarnLockChecksum": [
                1
            ],
            "yarnLockFileId": [
                3
            ],
            "availablePackages": [
                7
            ],
            "applicationRegistrationId": [
                3
            ],
            "canBeUninstalled": [
                6
            ],
            "defaultRoleId": [
                1
            ],
            "settingsCustomTabFrontComponentId": [
                3
            ],
            "defaultLogicFunctionRole": [
                29
            ],
            "agents": [
                25
            ],
            "frontComponents": [
                34
            ],
            "commandMenuItems": [
                35
            ],
            "logicFunctions": [
                41
            ],
            "objects": [
                52
            ],
            "applicationVariables": [
                31
            ],
            "applicationRegistration": [
                30
            ],
            "__typename": [
                1
            ]
        },
        "ViewField": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "isVisible": [
                6
            ],
            "size": [
                12
            ],
            "position": [
                12
            ],
            "aggregateOperation": [
                57
            ],
            "viewId": [
                3
            ],
            "viewFieldGroupId": [
                3
            ],
            "workspaceId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "isActive": [
                6
            ],
            "deletedAt": [
                4
            ],
            "isOverridden": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "AggregateOperations": {},
        "ViewFilterGroup": {
            "id": [
                3
            ],
            "parentViewFilterGroupId": [
                3
            ],
            "logicalOperator": [
                59
            ],
            "positionInViewFilterGroup": [
                12
            ],
            "viewId": [
                3
            ],
            "workspaceId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "deletedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "ViewFilterGroupLogicalOperator": {},
        "ViewFilter": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "operand": [
                61
            ],
            "value": [
                7
            ],
            "viewFilterGroupId": [
                3
            ],
            "positionInViewFilterGroup": [
                12
            ],
            "subFieldName": [
                1
            ],
            "relationTargetFieldMetadataId": [
                3
            ],
            "viewId": [
                3
            ],
            "workspaceId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "deletedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "ViewFilterOperand": {},
        "ViewGroup": {
            "id": [
                3
            ],
            "isVisible": [
                6
            ],
            "fieldValue": [
                1
            ],
            "position": [
                12
            ],
            "viewId": [
                3
            ],
            "workspaceId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "deletedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "ViewSort": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "direction": [
                64
            ],
            "subFieldName": [
                1
            ],
            "viewId": [
                3
            ],
            "workspaceId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "deletedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "ViewSortDirection": {},
        "ViewFieldGroup": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "position": [
                12
            ],
            "isVisible": [
                6
            ],
            "viewId": [
                3
            ],
            "workspaceId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "isActive": [
                6
            ],
            "deletedAt": [
                4
            ],
            "viewFields": [
                56
            ],
            "isOverridden": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "View": {
            "id": [
                3
            ],
            "universalIdentifier": [
                3
            ],
            "name": [
                1
            ],
            "objectMetadataId": [
                3
            ],
            "type": [
                67
            ],
            "key": [
                68
            ],
            "icon": [
                1
            ],
            "position": [
                12
            ],
            "isCompact": [
                6
            ],
            "isCustom": [
                6
            ],
            "openRecordIn": [
                69
            ],
            "kanbanAggregateOperation": [
                57
            ],
            "kanbanAggregateOperationFieldMetadataId": [
                3
            ],
            "mainGroupByFieldMetadataId": [
                3
            ],
            "shouldHideEmptyGroups": [
                6
            ],
            "kanbanColumnWidth": [
                21
            ],
            "calendarFieldMetadataId": [
                3
            ],
            "workspaceId": [
                3
            ],
            "anyFieldFilterValue": [
                1
            ],
            "calendarLayout": [
                70
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "deletedAt": [
                4
            ],
            "viewFields": [
                56
            ],
            "viewFilters": [
                60
            ],
            "viewFilterGroups": [
                58
            ],
            "viewSorts": [
                63
            ],
            "viewGroups": [
                62
            ],
            "viewFieldGroups": [
                65
            ],
            "visibility": [
                71
            ],
            "createdByUserWorkspaceId": [
                3
            ],
            "isActive": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "ViewType": {},
        "ViewKey": {},
        "ViewOpenRecordIn": {},
        "ViewCalendarLayout": {},
        "ViewVisibility": {},
        "Workspace": {
            "id": [
                3
            ],
            "displayName": [
                1
            ],
            "logo": [
                1
            ],
            "logoFileId": [
                3
            ],
            "inviteHash": [
                1
            ],
            "deletedAt": [
                4
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "allowImpersonation": [
                6
            ],
            "isPublicInviteLinkEnabled": [
                6
            ],
            "workspaceDiscoverability": [
                73
            ],
            "trashRetentionDays": [
                12
            ],
            "eventLogRetentionDays": [
                12
            ],
            "workspaceMembersCount": [
                12
            ],
            "activationStatus": [
                74
            ],
            "views": [
                66
            ],
            "viewFields": [
                56
            ],
            "viewFilters": [
                60
            ],
            "viewFilterGroups": [
                58
            ],
            "viewGroups": [
                62
            ],
            "viewSorts": [
                63
            ],
            "metadataVersion": [
                12
            ],
            "databaseSchema": [
                1
            ],
            "subdomain": [
                1
            ],
            "customDomain": [
                1
            ],
            "isGoogleAuthEnabled": [
                6
            ],
            "isGoogleAuthBypassEnabled": [
                6
            ],
            "isTwoFactorAuthenticationEnforced": [
                6
            ],
            "isPasswordAuthEnabled": [
                6
            ],
            "isPasswordAuthBypassEnabled": [
                6
            ],
            "isMicrosoftAuthEnabled": [
                6
            ],
            "isMicrosoftAuthBypassEnabled": [
                6
            ],
            "isCustomDomainEnabled": [
                6
            ],
            "isInternalMessagesImportEnabled": [
                6
            ],
            "editableProfileFields": [
                1
            ],
            "defaultRole": [
                29
            ],
            "fastModel": [
                1
            ],
            "smartModel": [
                1
            ],
            "aiAdditionalInstructions": [
                1
            ],
            "enabledAiModelIds": [
                1
            ],
            "useRecommendedModels": [
                6
            ],
            "routerModel": [
                1
            ],
            "workspaceCustomApplication": [
                55
            ],
            "featureFlags": [
                261
            ],
            "billingSubscriptions": [
                142
            ],
            "installedApplications": [
                55
            ],
            "currentBillingSubscription": [
                142
            ],
            "billingCustomer": [
                141
            ],
            "billingEntitlements": [
                257
            ],
            "hasValidSignedEnterpriseKey": [
                6
            ],
            "hasValidEnterpriseValidityToken": [
                6
            ],
            "workspaceUrls": [
                247
            ],
            "workspaceCustomApplicationId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceDiscoverability": {},
        "WorkspaceActivationStatus": {},
        "AppToken": {
            "id": [
                3
            ],
            "type": [
                1
            ],
            "expiresAt": [
                4
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "User": {
            "id": [
                3
            ],
            "firstName": [
                1
            ],
            "lastName": [
                1
            ],
            "email": [
                1
            ],
            "isEmailVerified": [
                6
            ],
            "disabled": [
                6
            ],
            "canImpersonate": [
                6
            ],
            "canAccessFullAdminPanel": [
                6
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "deletedAt": [
                4
            ],
            "locale": [
                1
            ],
            "workspaceMember": [
                20
            ],
            "userWorkspaces": [
                17
            ],
            "onboardingStatus": [
                77
            ],
            "currentWorkspace": [
                72
            ],
            "currentUserWorkspace": [
                17
            ],
            "userVars": [
                78
            ],
            "workspaceMembers": [
                20
            ],
            "deletedWorkspaceMembers": [
                251
            ],
            "hasPassword": [
                6
            ],
            "supportUserHash": [
                1
            ],
            "isMyahTeamMember": [
                6
            ],
            "workspaces": [
                17
            ],
            "availableWorkspaces": [
                250
            ],
            "__typename": [
                1
            ]
        },
        "OnboardingStatus": {},
        "JSONObject": {},
        "RatioAggregateConfig": {
            "fieldMetadataId": [
                3
            ],
            "optionValue": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "RichTextBody": {
            "blocknote": [
                1
            ],
            "markdown": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "GridPosition": {
            "row": [
                12
            ],
            "column": [
                12
            ],
            "rowSpan": [
                12
            ],
            "columnSpan": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "PageLayoutWidget": {
            "id": [
                3
            ],
            "applicationId": [
                3
            ],
            "pageLayoutTabId": [
                3
            ],
            "title": [
                1
            ],
            "type": [
                83
            ],
            "objectMetadataId": [
                3
            ],
            "gridPosition": [
                81
            ],
            "position": [
                84
            ],
            "configuration": [
                89
            ],
            "conditionalDisplay": [
                7
            ],
            "conditionalAvailabilityExpression": [
                1
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "isActive": [
                6
            ],
            "deletedAt": [
                4
            ],
            "isOverridden": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "WidgetType": {},
        "PageLayoutWidgetPosition": {
            "on_PageLayoutWidgetGridPosition": [
                85
            ],
            "on_PageLayoutWidgetVerticalListPosition": [
                87
            ],
            "on_PageLayoutWidgetCanvasPosition": [
                88
            ],
            "__typename": [
                1
            ]
        },
        "PageLayoutWidgetGridPosition": {
            "layoutMode": [
                86
            ],
            "row": [
                21
            ],
            "column": [
                21
            ],
            "rowSpan": [
                21
            ],
            "columnSpan": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "PageLayoutTabLayoutMode": {},
        "PageLayoutWidgetVerticalListPosition": {
            "layoutMode": [
                86
            ],
            "index": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "PageLayoutWidgetCanvasPosition": {
            "layoutMode": [
                86
            ],
            "__typename": [
                1
            ]
        },
        "WidgetConfiguration": {
            "on_AggregateChartConfiguration": [
                90
            ],
            "on_StandaloneRichTextConfiguration": [
                93
            ],
            "on_PieChartConfiguration": [
                94
            ],
            "on_LineChartConfiguration": [
                97
            ],
            "on_IframeConfiguration": [
                99
            ],
            "on_BarChartConfiguration": [
                100
            ],
            "on_CalendarConfiguration": [
                103
            ],
            "on_FrontComponentConfiguration": [
                104
            ],
            "on_EmailsConfiguration": [
                105
            ],
            "on_EmailThreadConfiguration": [
                106
            ],
            "on_FieldConfiguration": [
                107
            ],
            "on_FieldRichTextConfiguration": [
                109
            ],
            "on_FieldsConfiguration": [
                110
            ],
            "on_FilesConfiguration": [
                111
            ],
            "on_NotesConfiguration": [
                112
            ],
            "on_TasksConfiguration": [
                113
            ],
            "on_TimelineConfiguration": [
                114
            ],
            "on_ViewConfiguration": [
                115
            ],
            "on_RecordTableConfiguration": [
                116
            ],
            "on_WorkflowConfiguration": [
                117
            ],
            "on_WorkflowRunConfiguration": [
                118
            ],
            "on_WorkflowVersionConfiguration": [
                119
            ],
            "__typename": [
                1
            ]
        },
        "AggregateChartConfiguration": {
            "configurationType": [
                91
            ],
            "aggregateFieldMetadataId": [
                3
            ],
            "aggregateOperation": [
                57
            ],
            "label": [
                1
            ],
            "displayDataLabel": [
                6
            ],
            "numberFormat": [
                92
            ],
            "description": [
                1
            ],
            "filter": [
                7
            ],
            "timezone": [
                1
            ],
            "firstDayOfTheWeek": [
                21
            ],
            "prefix": [
                1
            ],
            "suffix": [
                1
            ],
            "ratioAggregateConfig": [
                79
            ],
            "__typename": [
                1
            ]
        },
        "WidgetConfigurationType": {},
        "ChartNumberFormat": {},
        "StandaloneRichTextConfiguration": {
            "configurationType": [
                91
            ],
            "body": [
                80
            ],
            "__typename": [
                1
            ]
        },
        "PieChartConfiguration": {
            "configurationType": [
                91
            ],
            "aggregateFieldMetadataId": [
                3
            ],
            "aggregateOperation": [
                57
            ],
            "groupByFieldMetadataId": [
                3
            ],
            "groupBySubFieldName": [
                1
            ],
            "dateGranularity": [
                95
            ],
            "orderBy": [
                96
            ],
            "manualSortOrder": [
                1
            ],
            "displayDataLabel": [
                6
            ],
            "showCenterMetric": [
                6
            ],
            "displayLegend": [
                6
            ],
            "hideEmptyCategory": [
                6
            ],
            "splitMultiValueFields": [
                6
            ],
            "description": [
                1
            ],
            "color": [
                1
            ],
            "filter": [
                7
            ],
            "timezone": [
                1
            ],
            "firstDayOfTheWeek": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "ObjectRecordGroupByDateGranularity": {},
        "GraphOrderBy": {},
        "LineChartConfiguration": {
            "configurationType": [
                91
            ],
            "aggregateFieldMetadataId": [
                3
            ],
            "aggregateOperation": [
                57
            ],
            "primaryAxisGroupByFieldMetadataId": [
                3
            ],
            "primaryAxisGroupBySubFieldName": [
                1
            ],
            "primaryAxisDateGranularity": [
                95
            ],
            "primaryAxisOrderBy": [
                96
            ],
            "primaryAxisManualSortOrder": [
                1
            ],
            "secondaryAxisGroupByFieldMetadataId": [
                3
            ],
            "secondaryAxisGroupBySubFieldName": [
                1
            ],
            "secondaryAxisGroupByDateGranularity": [
                95
            ],
            "secondaryAxisOrderBy": [
                96
            ],
            "secondaryAxisManualSortOrder": [
                1
            ],
            "omitNullValues": [
                6
            ],
            "splitMultiValueFields": [
                6
            ],
            "axisNameDisplay": [
                98
            ],
            "displayDataLabel": [
                6
            ],
            "displayLegend": [
                6
            ],
            "rangeMin": [
                12
            ],
            "rangeMax": [
                12
            ],
            "description": [
                1
            ],
            "color": [
                1
            ],
            "filter": [
                7
            ],
            "isStacked": [
                6
            ],
            "isCumulative": [
                6
            ],
            "timezone": [
                1
            ],
            "firstDayOfTheWeek": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "AxisNameDisplay": {},
        "IframeConfiguration": {
            "configurationType": [
                91
            ],
            "url": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "BarChartConfiguration": {
            "configurationType": [
                91
            ],
            "aggregateFieldMetadataId": [
                3
            ],
            "aggregateOperation": [
                57
            ],
            "primaryAxisGroupByFieldMetadataId": [
                3
            ],
            "primaryAxisGroupBySubFieldName": [
                1
            ],
            "primaryAxisDateGranularity": [
                95
            ],
            "primaryAxisOrderBy": [
                96
            ],
            "primaryAxisManualSortOrder": [
                1
            ],
            "secondaryAxisGroupByFieldMetadataId": [
                3
            ],
            "secondaryAxisGroupBySubFieldName": [
                1
            ],
            "secondaryAxisGroupByDateGranularity": [
                95
            ],
            "secondaryAxisOrderBy": [
                96
            ],
            "secondaryAxisManualSortOrder": [
                1
            ],
            "omitNullValues": [
                6
            ],
            "splitMultiValueFields": [
                6
            ],
            "axisNameDisplay": [
                98
            ],
            "displayDataLabel": [
                6
            ],
            "displayLegend": [
                6
            ],
            "rangeMin": [
                12
            ],
            "rangeMax": [
                12
            ],
            "description": [
                1
            ],
            "color": [
                1
            ],
            "filter": [
                7
            ],
            "groupMode": [
                101
            ],
            "layout": [
                102
            ],
            "isCumulative": [
                6
            ],
            "timezone": [
                1
            ],
            "firstDayOfTheWeek": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "BarChartGroupMode": {},
        "BarChartLayout": {},
        "CalendarConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "FrontComponentConfiguration": {
            "configurationType": [
                91
            ],
            "frontComponentId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "EmailsConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "EmailThreadConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "FieldConfiguration": {
            "configurationType": [
                91
            ],
            "fieldMetadataId": [
                1
            ],
            "fieldDisplayMode": [
                108
            ],
            "viewId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "FieldDisplayMode": {},
        "FieldRichTextConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "FieldsConfiguration": {
            "configurationType": [
                91
            ],
            "viewId": [
                1
            ],
            "newFieldDefaultVisibility": [
                6
            ],
            "shouldAllowUserToSeeHiddenFields": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "FilesConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "NotesConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "TasksConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "TimelineConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "ViewConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "RecordTableConfiguration": {
            "configurationType": [
                91
            ],
            "viewId": [
                1
            ],
            "recordLimit": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "WorkflowConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "WorkflowRunConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "WorkflowVersionConfiguration": {
            "configurationType": [
                91
            ],
            "__typename": [
                1
            ]
        },
        "PageLayoutTab": {
            "id": [
                3
            ],
            "applicationId": [
                3
            ],
            "universalIdentifier": [
                3
            ],
            "title": [
                1
            ],
            "position": [
                12
            ],
            "pageLayoutId": [
                3
            ],
            "widgets": [
                82
            ],
            "icon": [
                1
            ],
            "layoutMode": [
                86
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "isActive": [
                6
            ],
            "deletedAt": [
                4
            ],
            "isOverridden": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "PageLayout": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "type": [
                122
            ],
            "objectMetadataId": [
                3
            ],
            "tabs": [
                120
            ],
            "defaultTabToFocusOnMobileAndSidePanelId": [
                3
            ],
            "universalIdentifier": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "deletedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "PageLayoutType": {},
        "ApplicationConnectionProviderOAuthConfig": {
            "scopes": [
                1
            ],
            "isClientCredentialsConfigured": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "ApplicationConnectionProvider": {
            "id": [
                3
            ],
            "applicationId": [
                1
            ],
            "type": [
                1
            ],
            "name": [
                1
            ],
            "displayName": [
                1
            ],
            "oauth": [
                123
            ],
            "__typename": [
                1
            ]
        },
        "EnterpriseLicenseInfoDTO": {
            "isValid": [
                6
            ],
            "licensee": [
                1
            ],
            "expiresAt": [
                4
            ],
            "subscriptionId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "EnterpriseSubscriptionStatusDTO": {
            "status": [
                1
            ],
            "licensee": [
                1
            ],
            "expiresAt": [
                4
            ],
            "cancelAt": [
                4
            ],
            "currentPeriodEnd": [
                4
            ],
            "isCancellationScheduled": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "BillingSubscriptionSchedulePhaseItem": {
            "price": [
                1
            ],
            "quantity": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "BillingSubscriptionSchedulePhase": {
            "start_date": [
                12
            ],
            "end_date": [
                12
            ],
            "items": [
                127
            ],
            "__typename": [
                1
            ]
        },
        "BillingProductMetadata": {
            "planKey": [
                130
            ],
            "priceUsageBased": [
                131
            ],
            "productKey": [
                132
            ],
            "__typename": [
                1
            ]
        },
        "BillingPlanKey": {},
        "BillingUsageType": {},
        "BillingProductKey": {},
        "BillingPriceLicensed": {
            "recurringInterval": [
                134
            ],
            "unitAmount": [
                12
            ],
            "stripePriceId": [
                1
            ],
            "priceUsageType": [
                131
            ],
            "creditAmount": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "SubscriptionInterval": {},
        "BillingPriceTier": {
            "upTo": [
                12
            ],
            "flatAmount": [
                12
            ],
            "unitAmount": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "BillingPriceMetered": {
            "tiers": [
                135
            ],
            "recurringInterval": [
                134
            ],
            "stripePriceId": [
                1
            ],
            "priceUsageType": [
                131
            ],
            "__typename": [
                1
            ]
        },
        "BillingProduct": {
            "name": [
                1
            ],
            "description": [
                1
            ],
            "images": [
                1
            ],
            "metadata": [
                129
            ],
            "__typename": [
                1
            ]
        },
        "BillingLicensedProduct": {
            "name": [
                1
            ],
            "description": [
                1
            ],
            "images": [
                1
            ],
            "metadata": [
                129
            ],
            "prices": [
                133
            ],
            "__typename": [
                1
            ]
        },
        "BillingMeteredProduct": {
            "name": [
                1
            ],
            "description": [
                1
            ],
            "images": [
                1
            ],
            "metadata": [
                129
            ],
            "prices": [
                136
            ],
            "__typename": [
                1
            ]
        },
        "BillingSubscriptionItem": {
            "id": [
                3
            ],
            "hasReachedCurrentPeriodCap": [
                6
            ],
            "quantity": [
                12
            ],
            "stripePriceId": [
                1
            ],
            "billingProduct": [
                0
            ],
            "__typename": [
                1
            ]
        },
        "BillingCustomer": {
            "id": [
                3
            ],
            "hasPaymentMethod": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "BillingSubscription": {
            "id": [
                3
            ],
            "status": [
                143
            ],
            "interval": [
                134
            ],
            "billingSubscriptionItems": [
                140
            ],
            "currentPeriodEnd": [
                4
            ],
            "metadata": [
                7
            ],
            "phases": [
                128
            ],
            "cancelAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "SubscriptionStatus": {},
        "BillingEndTrialPeriod": {
            "status": [
                143
            ],
            "hasPaymentMethod": [
                6
            ],
            "billingPortalUrl": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "BillingResourceCreditUsage": {
            "productKey": [
                132
            ],
            "periodStart": [
                4
            ],
            "periodEnd": [
                4
            ],
            "usedCredits": [
                12
            ],
            "grantedCredits": [
                12
            ],
            "rolloverCredits": [
                12
            ],
            "totalGrantedCredits": [
                12
            ],
            "unitPriceCents": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "BillingPlan": {
            "planKey": [
                130
            ],
            "baseProducts": [
                138
            ],
            "resourceCreditProducts": [
                138
            ],
            "meteredProducts": [
                139
            ],
            "__typename": [
                1
            ]
        },
        "BillingPaymentIntent": {
            "clientSecret": [
                1
            ],
            "paymentIntentType": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "BillingSession": {
            "url": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "BillingUpdate": {
            "currentBillingSubscription": [
                142
            ],
            "billingSubscriptions": [
                142
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderCustomerFundingBillingAddress": {
            "city": [
                1
            ],
            "country": [
                1
            ],
            "line1": [
                1
            ],
            "line2": [
                1
            ],
            "postalCode": [
                1
            ],
            "state": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderCustomerFundingCardSummary": {
            "brand": [
                1
            ],
            "expiryMonth": [
                12
            ],
            "expiryYear": [
                12
            ],
            "last4": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderCustomerFundingTaxIdSummary": {
            "country": [
                1
            ],
            "type": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderCustomerFundingBillingSummary": {
            "address": [
                150
            ],
            "card": [
                151
            ],
            "name": [
                1
            ],
            "paymentMethodReady": [
                6
            ],
            "taxId": [
                152
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderAiTopUpPolicy": {
            "incrementCents": [
                21
            ],
            "minimumPrincipalCents": [
                21
            ],
            "maximumPrincipalCents": [
                21
            ],
            "suggestedPrincipalCents": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderCustomerFundingHistoryItem": {
            "id": [
                1
            ],
            "fundingType": [
                1
            ],
            "state": [
                1
            ],
            "principalCents": [
                1
            ],
            "taxCents": [
                1
            ],
            "collectedTotalCents": [
                1
            ],
            "expiresAt": [
                4
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "invoiceUrl": [
                1
            ],
            "actionRequired": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderCustomerFundingPaymentMethod": {
            "ready": [
                6
            ],
            "clientSecret": [
                1
            ],
            "billingSummary": [
                153
            ],
            "publishableKey": [
                1
            ],
            "setupIntentId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderCustomerFundingPaymentAction": {
            "clientSecret": [
                1
            ],
            "publishableKey": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderBillingStatus": {
            "available": [
                6
            ],
            "prepaidBalanceCents": [
                1
            ],
            "pendingOperationCount": [
                21
            ],
            "reconciliationRequiredOperationCount": [
                21
            ],
            "customerFundingAvailable": [
                6
            ],
            "customerFundingPaymentMethodReady": [
                6
            ],
            "customerFundingPolicy": [
                154
            ],
            "customerFundingHistory": [
                155
            ],
            "customerFundingBillingSummary": [
                153
            ],
            "__typename": [
                1
            ]
        },
        "VerificationRecord": {
            "type": [
                1
            ],
            "key": [
                1
            ],
            "value": [
                1
            ],
            "priority": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "EmailingDomain": {
            "id": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "domain": [
                1
            ],
            "status": [
                161
            ],
            "verificationRecords": [
                159
            ],
            "verifiedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "EmailingDomainStatus": {},
        "PublicConnectionParametersOutput": {
            "host": [
                1
            ],
            "port": [
                12
            ],
            "username": [
                1
            ],
            "connectionSecurity": [
                163
            ],
            "__typename": [
                1
            ]
        },
        "EmailConnectionSecurity": {},
        "PublicImapSmtpCaldavConnectionParameters": {
            "IMAP": [
                162
            ],
            "SMTP": [
                162
            ],
            "CALDAV": [
                162
            ],
            "__typename": [
                1
            ]
        },
        "ConnectedAccountPublicDTO": {
            "id": [
                3
            ],
            "handle": [
                1
            ],
            "provider": [
                1
            ],
            "lastCredentialsRefreshedAt": [
                4
            ],
            "authFailedAt": [
                4
            ],
            "archivedAt": [
                4
            ],
            "handleAliases": [
                1
            ],
            "scopes": [
                1
            ],
            "lastSignedInAt": [
                4
            ],
            "userWorkspaceId": [
                3
            ],
            "connectionProviderId": [
                3
            ],
            "applicationId": [
                3
            ],
            "name": [
                1
            ],
            "visibility": [
                1
            ],
            "dailySendLimit": [
                21
            ],
            "minimumSendIntervalMs": [
                21
            ],
            "sendingPolicyRevision": [
                21
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "connectionParameters": [
                164
            ],
            "__typename": [
                1
            ]
        },
        "MessageChannel": {
            "id": [
                3
            ],
            "visibility": [
                167
            ],
            "handle": [
                1
            ],
            "type": [
                168
            ],
            "isContactAutoCreationEnabled": [
                6
            ],
            "contactAutoCreationPolicy": [
                169
            ],
            "messageFolderImportPolicy": [
                170
            ],
            "excludeNonProfessionalEmails": [
                6
            ],
            "excludeGroupEmails": [
                6
            ],
            "pendingGroupEmailsAction": [
                171
            ],
            "isSyncEnabled": [
                6
            ],
            "syncedAt": [
                4
            ],
            "syncStatus": [
                172
            ],
            "syncStage": [
                173
            ],
            "syncStageStartedAt": [
                4
            ],
            "throttleFailureCount": [
                12
            ],
            "throttleRetryAfter": [
                4
            ],
            "connectedAccountId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "connectedAccount": [
                165
            ],
            "__typename": [
                1
            ]
        },
        "MessageChannelVisibility": {},
        "MessageChannelType": {},
        "MessageChannelContactAutoCreationPolicy": {},
        "MessageFolderImportPolicy": {},
        "MessageChannelPendingGroupEmailsAction": {},
        "MessageChannelSyncStatus": {},
        "MessageChannelSyncStage": {},
        "CreateEmailGroupChannelOutput": {
            "messageChannel": [
                166
            ],
            "forwardingAddress": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignAudiencePreviewDTO": {
            "totalMembers": [
                21
            ],
            "withoutEmail": [
                21
            ],
            "duplicateEmails": [
                21
            ],
            "globallyUnsubscribed": [
                21
            ],
            "topicUnsubscribed": [
                21
            ],
            "sendable": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "SendEmailViaDomainOutput": {
            "messageId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignSkippedRecipientsDTO": {
            "noEmail": [
                21
            ],
            "deduped": [
                21
            ],
            "overCap": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "SendMessageCampaignOutputDTO": {
            "campaignId": [
                1
            ],
            "queuedCount": [
                21
            ],
            "skipped": [
                177
            ],
            "__typename": [
                1
            ]
        },
        "UnsubscribeTopic": {
            "id": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "name": [
                1
            ],
            "description": [
                1
            ],
            "visibility": [
                180
            ],
            "__typename": [
                1
            ]
        },
        "UnsubscribeTopicVisibility": {},
        "FileWithSignedUrl": {
            "id": [
                3
            ],
            "path": [
                1
            ],
            "size": [
                12
            ],
            "createdAt": [
                4
            ],
            "url": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "FileUploadTarget": {
            "fileId": [
                3
            ],
            "uploadUrl": [
                1
            ],
            "contentType": [
                1
            ],
            "expiresAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "RecordIdentifier": {
            "id": [
                3
            ],
            "labelIdentifier": [
                1
            ],
            "imageIdentifier": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "NavigationMenuItem": {
            "id": [
                3
            ],
            "userWorkspaceId": [
                3
            ],
            "targetRecordId": [
                3
            ],
            "targetObjectMetadataId": [
                3
            ],
            "viewId": [
                3
            ],
            "type": [
                185
            ],
            "name": [
                1
            ],
            "link": [
                1
            ],
            "icon": [
                1
            ],
            "color": [
                1
            ],
            "folderId": [
                3
            ],
            "pageLayoutId": [
                3
            ],
            "position": [
                12
            ],
            "applicationId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "targetRecordIdentifier": [
                183
            ],
            "__typename": [
                1
            ]
        },
        "NavigationMenuItemType": {},
        "ObjectRecordEventProperties": {
            "updatedFields": [
                1
            ],
            "before": [
                7
            ],
            "after": [
                7
            ],
            "diff": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "MetadataEvent": {
            "type": [
                188
            ],
            "metadataName": [
                1
            ],
            "recordId": [
                1
            ],
            "properties": [
                186
            ],
            "updatedCollectionHash": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "MetadataEventAction": {},
        "ObjectRecordEvent": {
            "action": [
                190
            ],
            "objectNameSingular": [
                1
            ],
            "recordId": [
                1
            ],
            "userId": [
                1
            ],
            "workspaceMemberId": [
                1
            ],
            "properties": [
                186
            ],
            "__typename": [
                1
            ]
        },
        "DatabaseEventAction": {},
        "ObjectRecordEventWithQueryIds": {
            "queryIds": [
                1
            ],
            "objectRecordEvent": [
                189
            ],
            "__typename": [
                1
            ]
        },
        "EventSubscription": {
            "eventStreamId": [
                1
            ],
            "objectRecordEventsWithQueryIds": [
                191
            ],
            "metadataEvents": [
                187
            ],
            "__typename": [
                1
            ]
        },
        "LogicFunctionExecutionResult": {
            "data": [
                7
            ],
            "logs": [
                1
            ],
            "duration": [
                12
            ],
            "status": [
                194
            ],
            "error": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "LogicFunctionExecutionStatus": {},
        "LogicFunctionLogs": {
            "logs": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "IndexField": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "order": [
                12
            ],
            "subFieldName": [
                1
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "IndexEdge": {
            "node": [
                45
            ],
            "cursor": [
                48
            ],
            "__typename": [
                1
            ]
        },
        "PageInfo": {
            "hasNextPage": [
                6
            ],
            "hasPreviousPage": [
                6
            ],
            "startCursor": [
                48
            ],
            "endCursor": [
                48
            ],
            "__typename": [
                1
            ]
        },
        "IndexConnection": {
            "pageInfo": [
                198
            ],
            "edges": [
                197
            ],
            "__typename": [
                1
            ]
        },
        "ObjectEdge": {
            "node": [
                52
            ],
            "cursor": [
                48
            ],
            "__typename": [
                1
            ]
        },
        "IndexObjectMetadataConnection": {
            "pageInfo": [
                198
            ],
            "edges": [
                200
            ],
            "__typename": [
                1
            ]
        },
        "ObjectRecordCount": {
            "objectNamePlural": [
                1
            ],
            "totalCount": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "SearchField": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "tsVectorFieldMetadataId": [
                3
            ],
            "position": [
                12
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "ObjectConnection": {
            "pageInfo": [
                198
            ],
            "edges": [
                200
            ],
            "__typename": [
                1
            ]
        },
        "ObjectIndexMetadatasConnection": {
            "pageInfo": [
                198
            ],
            "edges": [
                197
            ],
            "__typename": [
                1
            ]
        },
        "FieldEdge": {
            "node": [
                43
            ],
            "cursor": [
                48
            ],
            "__typename": [
                1
            ]
        },
        "ObjectFieldsConnection": {
            "pageInfo": [
                198
            ],
            "edges": [
                206
            ],
            "__typename": [
                1
            ]
        },
        "CampaignSenderReadinessDTO": {
            "bindingStatus": [
                1
            ],
            "campaignAccountId": [
                3
            ],
            "connectedAccountId": [
                3
            ],
            "messageChannelId": [
                3
            ],
            "senderHandle": [
                1
            ],
            "provider": [
                1
            ],
            "status": [
                1
            ],
            "reason": [
                1
            ],
            "recoveryPath": [
                1
            ],
            "dailySendLimit": [
                21
            ],
            "minimumSendIntervalMs": [
                21
            ],
            "missingBinding": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignSenderPoolSnapshotDTO": {
            "rotationPolicyId": [
                1
            ],
            "serializationRevision": [
                1
            ],
            "mailboxes": [
                208
            ],
            "senderPoolFingerprint": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ExactCampaignEmailSenderResultDTO": {
            "status": [
                1
            ],
            "sender": [
                208
            ],
            "reason": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignSenderCandidateReadinessDTO": {
            "rotationPolicyId": [
                1
            ],
            "connectedAccountId": [
                3
            ],
            "messageChannelId": [
                3
            ],
            "senderHandle": [
                1
            ],
            "status": [
                1
            ],
            "reason": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignEmailAccountDTO": {
            "id": [
                3
            ],
            "connectedAccountId": [
                3
            ],
            "messageChannelId": [
                3
            ],
            "provider": [
                1
            ],
            "senderEmail": [
                1
            ],
            "label": [
                1
            ],
            "isDefault": [
                6
            ],
            "health": [
                213
            ],
            "senderReadiness": [
                211
            ],
            "__typename": [
                1
            ]
        },
        "CampaignEmailAccountHealth": {},
        "CampaignCreatorDTO": {
            "id": [
                3
            ],
            "campaignId": [
                3
            ],
            "creatorId": [
                3
            ],
            "isDirectlyAdded": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "CampaignCreatorListDTO": {
            "id": [
                3
            ],
            "campaignId": [
                3
            ],
            "creatorListId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CampaignInfluencerSnapshotDTO": {
            "campaignCreators": [
                214
            ],
            "campaignCreatorLists": [
                215
            ],
            "__typename": [
                1
            ]
        },
        "CampaignCreatorListRemovalImpactDTO": {
            "requiresConfirmation": [
                6
            ],
            "affectedCreatorIds": [
                3
            ],
            "confirmationToken": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignCreatorListAdditionCandidatesDTO": {
            "creatorIds": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CreatorListMemberDTO": {
            "id": [
                3
            ],
            "creatorListId": [
                3
            ],
            "creatorId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CreatorListMembershipRemovalImpactDTO": {
            "affectedCampaignIds": [
                3
            ],
            "requiresConfirmation": [
                6
            ],
            "confirmationToken": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ApprovedAccessDomain": {
            "id": [
                3
            ],
            "domain": [
                1
            ],
            "isValidated": [
                6
            ],
            "createdAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "OnboardingStepSuccess": {
            "success": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceInvitation": {
            "id": [
                3
            ],
            "email": [
                1
            ],
            "roleId": [
                3
            ],
            "expiresAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "SendInvitations": {
            "success": [
                6
            ],
            "errors": [
                1
            ],
            "result": [
                223
            ],
            "__typename": [
                1
            ]
        },
        "ActionApprovalEvidenceLink": {
            "objectMetadataId": [
                1
            ],
            "recordId": [
                1
            ],
            "role": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ActionApprovalProposal": {
            "action": [
                1
            ],
            "actionVersion": [
                21
            ],
            "body": [
                1
            ],
            "recipientLabel": [
                1
            ],
            "sendingAccountLabel": [
                1
            ],
            "subject": [
                1
            ],
            "draftRevision": [
                21
            ],
            "state": [
                1
            ],
            "expiresAt": [
                4
            ],
            "occurredAt": [
                4
            ],
            "evidenceLinks": [
                225
            ],
            "__typename": [
                1
            ]
        },
        "ActionExecutionReceipt": {
            "state": [
                1
            ],
            "occurredAt": [
                4
            ],
            "outcome": [
                1
            ],
            "evidenceLinks": [
                225
            ],
            "__typename": [
                1
            ]
        },
        "VersionDistributionEntry": {
            "version": [
                1
            ],
            "count": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "ApplicationRegistrationStats": {
            "activeInstalls": [
                21
            ],
            "mostInstalledVersion": [
                1
            ],
            "versionDistribution": [
                228
            ],
            "__typename": [
                1
            ]
        },
        "CreateApplicationRegistration": {
            "applicationRegistration": [
                8
            ],
            "clientSecret": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "PublicApplicationRegistration": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "logoUrl": [
                1
            ],
            "websiteUrl": [
                1
            ],
            "oAuthScopes": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "RotateClientSecret": {
            "clientSecret": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ApplicationRegistrationVariableDTO": {
            "id": [
                3
            ],
            "key": [
                1
            ],
            "value": [
                1
            ],
            "description": [
                1
            ],
            "isSecret": [
                6
            ],
            "isRequired": [
                6
            ],
            "isFilled": [
                6
            ],
            "type": [
                1
            ],
            "options": [
                7
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "Relation": {
            "type": [
                235
            ],
            "sourceObjectMetadata": [
                52
            ],
            "targetObjectMetadata": [
                52
            ],
            "sourceFieldMetadata": [
                43
            ],
            "targetFieldMetadata": [
                43
            ],
            "__typename": [
                1
            ]
        },
        "RelationType": {},
        "FieldConnection": {
            "pageInfo": [
                198
            ],
            "edges": [
                206
            ],
            "__typename": [
                1
            ]
        },
        "AppConnection": {
            "id": [
                238
            ],
            "providerName": [
                1
            ],
            "name": [
                1
            ],
            "handle": [
                1
            ],
            "visibility": [
                1
            ],
            "userWorkspaceId": [
                1
            ],
            "accessToken": [
                1
            ],
            "scopes": [
                1
            ],
            "authFailedAt": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ID": {},
        "ResendEmailVerificationToken": {
            "success": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "DeleteSso": {
            "identityProviderId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "EditSso": {
            "id": [
                3
            ],
            "type": [
                242
            ],
            "issuer": [
                1
            ],
            "name": [
                1
            ],
            "status": [
                243
            ],
            "__typename": [
                1
            ]
        },
        "IdentityProviderType": {},
        "SSOIdentityProviderStatus": {},
        "WorkspaceNameAndId": {
            "displayName": [
                1
            ],
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "FindAvailableSSOIDP": {
            "type": [
                242
            ],
            "id": [
                3
            ],
            "issuer": [
                1
            ],
            "name": [
                1
            ],
            "status": [
                243
            ],
            "workspace": [
                244
            ],
            "__typename": [
                1
            ]
        },
        "SetupSso": {
            "id": [
                3
            ],
            "type": [
                242
            ],
            "issuer": [
                1
            ],
            "name": [
                1
            ],
            "status": [
                243
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceUrls": {
            "customUrl": [
                1
            ],
            "subdomainUrl": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "SSOConnection": {
            "type": [
                242
            ],
            "id": [
                3
            ],
            "issuer": [
                1
            ],
            "name": [
                1
            ],
            "status": [
                243
            ],
            "__typename": [
                1
            ]
        },
        "AvailableWorkspace": {
            "id": [
                3
            ],
            "displayName": [
                1
            ],
            "loginToken": [
                1
            ],
            "personalInviteToken": [
                1
            ],
            "inviteHash": [
                1
            ],
            "workspaceUrls": [
                247
            ],
            "logo": [
                1
            ],
            "sso": [
                248
            ],
            "__typename": [
                1
            ]
        },
        "AvailableWorkspaces": {
            "availableWorkspacesForSignIn": [
                249
            ],
            "availableWorkspacesForSignUp": [
                249
            ],
            "__typename": [
                1
            ]
        },
        "DeletedWorkspaceMember": {
            "id": [
                3
            ],
            "name": [
                19
            ],
            "userEmail": [
                1
            ],
            "avatarUrl": [
                1
            ],
            "userWorkspaceId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "MarketplaceApp": {
            "id": [
                1
            ],
            "name": [
                1
            ],
            "description": [
                1
            ],
            "author": [
                1
            ],
            "category": [
                1
            ],
            "logo": [
                1
            ],
            "sourcePackage": [
                1
            ],
            "isFeatured": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "MarketplaceAppRoleObjectPermission": {
            "universalIdentifier": [
                1
            ],
            "objectUniversalIdentifier": [
                1
            ],
            "canReadObjectRecords": [
                6
            ],
            "canUpdateObjectRecords": [
                6
            ],
            "canSoftDeleteObjectRecords": [
                6
            ],
            "canDestroyObjectRecords": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "MarketplaceAppRoleFieldPermission": {
            "universalIdentifier": [
                1
            ],
            "objectUniversalIdentifier": [
                1
            ],
            "fieldUniversalIdentifier": [
                1
            ],
            "canReadFieldValue": [
                6
            ],
            "canUpdateFieldValue": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "MarketplaceAppRole": {
            "universalIdentifier": [
                1
            ],
            "label": [
                1
            ],
            "description": [
                1
            ],
            "icon": [
                1
            ],
            "canUpdateAllSettings": [
                6
            ],
            "canAccessAllTools": [
                6
            ],
            "canReadAllObjectRecords": [
                6
            ],
            "canUpdateAllObjectRecords": [
                6
            ],
            "canSoftDeleteAllObjectRecords": [
                6
            ],
            "canDestroyAllObjectRecords": [
                6
            ],
            "permissionFlagUniversalIdentifiers": [
                1
            ],
            "objectPermissions": [
                253
            ],
            "fieldPermissions": [
                254
            ],
            "__typename": [
                1
            ]
        },
        "MarketplaceAppDetail": {
            "universalIdentifier": [
                1
            ],
            "id": [
                1
            ],
            "name": [
                1
            ],
            "sourceType": [
                9
            ],
            "sourcePackage": [
                1
            ],
            "latestAvailableVersion": [
                1
            ],
            "isListed": [
                6
            ],
            "isFeatured": [
                6
            ],
            "description": [
                1
            ],
            "author": [
                1
            ],
            "category": [
                1
            ],
            "logo": [
                1
            ],
            "websiteUrl": [
                1
            ],
            "aboutDescription": [
                1
            ],
            "termsUrl": [
                1
            ],
            "emailSupport": [
                1
            ],
            "issueReportUrl": [
                1
            ],
            "screenshots": [
                1
            ],
            "defaultRoleUniversalIdentifier": [
                1
            ],
            "roles": [
                255
            ],
            "manifest": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "BillingEntitlement": {
            "key": [
                258
            ],
            "value": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "BillingEntitlementKey": {},
        "DomainRecord": {
            "validationType": [
                1
            ],
            "type": [
                1
            ],
            "status": [
                1
            ],
            "key": [
                1
            ],
            "value": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "DomainValidRecords": {
            "id": [
                3
            ],
            "domain": [
                1
            ],
            "records": [
                259
            ],
            "isCustomDomainEnabled": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "FeatureFlag": {
            "key": [
                262
            ],
            "value": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "FeatureFlagKey": {},
        "SSOIdentityProvider": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "type": [
                242
            ],
            "status": [
                243
            ],
            "issuer": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "AuthProviders": {
            "sso": [
                263
            ],
            "google": [
                6
            ],
            "magicLink": [
                6
            ],
            "password": [
                6
            ],
            "microsoft": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "AuthBypassProviders": {
            "google": [
                6
            ],
            "password": [
                6
            ],
            "microsoft": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "PublicWorkspaceData": {
            "id": [
                3
            ],
            "authProviders": [
                264
            ],
            "authBypassProviders": [
                265
            ],
            "logo": [
                1
            ],
            "displayName": [
                1
            ],
            "workspaceUrls": [
                247
            ],
            "__typename": [
                1
            ]
        },
        "PublicWorkspaceDataSummary": {
            "id": [
                3
            ],
            "logo": [
                1
            ],
            "displayName": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "UpsertRowLevelPermissionPredicatesResult": {
            "predicates": [
                14
            ],
            "predicateGroups": [
                11
            ],
            "__typename": [
                1
            ]
        },
        "DeleteTwoFactorAuthenticationMethod": {
            "success": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "InitiateTwoFactorAuthenticationProvisioning": {
            "uri": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "VerifyTwoFactorAuthenticationMethod": {
            "success": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "AuthorizeApp": {
            "redirectUrl": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "AuthTokenPair": {
            "accessOrWorkspaceAgnosticToken": [
                32
            ],
            "refreshToken": [
                32
            ],
            "__typename": [
                1
            ]
        },
        "AvailableWorkspacesAndAccessTokens": {
            "tokens": [
                273
            ],
            "availableWorkspaces": [
                250
            ],
            "__typename": [
                1
            ]
        },
        "EmailPasswordResetLink": {
            "success": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "GetAuthorizationUrlForSSO": {
            "authorizationURL": [
                1
            ],
            "type": [
                1
            ],
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "InvalidatePassword": {
            "success": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceUrlsAndId": {
            "workspaceUrls": [
                247
            ],
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "SignUp": {
            "loginToken": [
                32
            ],
            "workspace": [
                278
            ],
            "__typename": [
                1
            ]
        },
        "TransientToken": {
            "transientToken": [
                32
            ],
            "__typename": [
                1
            ]
        },
        "ValidatePasswordResetToken": {
            "id": [
                3
            ],
            "email": [
                1
            ],
            "hasPassword": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "VerifyEmailAndGetLoginToken": {
            "loginToken": [
                32
            ],
            "workspaceUrls": [
                247
            ],
            "__typename": [
                1
            ]
        },
        "SubdomainAvailabilityDTO": {
            "isValid": [
                6
            ],
            "available": [
                6
            ],
            "suggestedSubdomain": [
                1
            ],
            "suggestedSubdomains": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceCreationDefaultsDTO": {
            "displayName": [
                1
            ],
            "subdomain": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ApiKeyToken": {
            "token": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "AuthTokens": {
            "tokens": [
                273
            ],
            "__typename": [
                1
            ]
        },
        "LoginToken": {
            "loginToken": [
                32
            ],
            "__typename": [
                1
            ]
        },
        "CheckUserExist": {
            "exists": [
                6
            ],
            "availableWorkspacesCount": [
                12
            ],
            "isEmailVerified": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceInviteHashValid": {
            "isValid": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "ImapSmtpCaldavPublicConnectionParams": {
            "host": [
                1
            ],
            "port": [
                12
            ],
            "username": [
                1
            ],
            "connectionSecurity": [
                163
            ],
            "__typename": [
                1
            ]
        },
        "ImapSmtpCaldavPublicConnectionParameters": {
            "IMAP": [
                290
            ],
            "SMTP": [
                290
            ],
            "CALDAV": [
                290
            ],
            "__typename": [
                1
            ]
        },
        "ConnectedImapSmtpCaldavAccount": {
            "id": [
                3
            ],
            "handle": [
                1
            ],
            "provider": [
                1
            ],
            "userWorkspaceId": [
                3
            ],
            "connectionParameters": [
                291
            ],
            "__typename": [
                1
            ]
        },
        "ImapSmtpCaldavConnectionSuccess": {
            "success": [
                6
            ],
            "connectedAccountId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailOverview": {
            "acquisitionAvailable": [
                6
            ],
            "actionRequiredCount": [
                21
            ],
            "domainCount": [
                21
            ],
            "mailboxCount": [
                21
            ],
            "readyCount": [
                21
            ],
            "status": [
                1
            ],
            "warmingCount": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailDomain": {
            "cancelAtPeriodEnd": [
                6
            ],
            "dependentMailboxCount": [
                21
            ],
            "domain": [
                1
            ],
            "id": [
                1
            ],
            "infrastructureState": [
                1
            ],
            "paidThrough": [
                4
            ],
            "renewalEnabled": [
                6
            ],
            "safeFailureCode": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailMailbox": {
            "address": [
                1
            ],
            "adminDailyCap": [
                21
            ],
            "campaignEligibility": [
                1
            ],
            "domain": [
                1
            ],
            "domainId": [
                1
            ],
            "id": [
                1
            ],
            "infrastructureCancelAtPeriodEnd": [
                6
            ],
            "infrastructureState": [
                1
            ],
            "lastHealthEvaluatedAt": [
                4
            ],
            "personaDisplayName": [
                1
            ],
            "personaRole": [
                1
            ],
            "policySafeDailyCapacity": [
                21
            ],
            "safeFailureCode": [
                1
            ],
            "servicePaidThrough": [
                4
            ],
            "warmupCancelAtPeriodEnd": [
                6
            ],
            "warmupState": [
                1
            ],
            "warmupPaidThrough": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailBundleMailbox": {
            "address": [
                1
            ],
            "displayName": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailBundle": {
            "bundleId": [
                1
            ],
            "domain": [
                1
            ],
            "exclusiveWorkspaceUse": [
                6
            ],
            "mailboxes": [
                297
            ],
            "mailboxCount": [
                21
            ],
            "observedAt": [
                4
            ],
            "providerType": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailDisclosures": {
            "cancellation": [
                1
            ],
            "managedServiceOwnership": [
                1
            ],
            "prepaidBalance": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailProposalMailbox": {
            "address": [
                1
            ],
            "displayName": [
                1
            ],
            "roleTitle": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailProposalDomain": {
            "domain": [
                1
            ],
            "mailboxes": [
                300
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailProposal": {
            "disclosures": [
                299
            ],
            "domains": [
                301
            ],
            "expiresAt": [
                4
            ],
            "id": [
                1
            ],
            "mailboxCount": [
                21
            ],
            "policyVersion": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailQuoteLine": {
            "amountCents": [
                21
            ],
            "billingFrequency": [
                1
            ],
            "endingBefore": [
                4
            ],
            "productKey": [
                1
            ],
            "quantity": [
                21
            ],
            "startingAt": [
                4
            ],
            "unitPriceCents": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailQuote": {
            "currency": [
                1
            ],
            "disclosures": [
                299
            ],
            "dueTodayCents": [
                21
            ],
            "expiresAt": [
                4
            ],
            "id": [
                1
            ],
            "lines": [
                303
            ],
            "quoteFingerprint": [
                1
            ],
            "quoteVersion": [
                1
            ],
            "isSandbox": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailPaymentSetup": {
            "clientSecret": [
                1
            ],
            "publishableKey": [
                1
            ],
            "setupIntentId": [
                1
            ],
            "ready": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailPaymentMethodStatus": {
            "ready": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailSubscription": {
            "action": [
                1
            ],
            "billingInterval": [
                1
            ],
            "currency": [
                1
            ],
            "paidThrough": [
                4
            ],
            "productKey": [
                1
            ],
            "quantity": [
                21
            ],
            "recurringAmountCents": [
                21
            ],
            "resourceIds": [
                1
            ],
            "resourceLabels": [
                1
            ],
            "resourceType": [
                1
            ],
            "service": [
                1
            ],
            "status": [
                1
            ],
            "unitPriceCents": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailOperation": {
            "acquisitionMode": [
                1
            ],
            "amountCents": [
                1
            ],
            "createdAt": [
                4
            ],
            "currency": [
                1
            ],
            "id": [
                1
            ],
            "paymentStatus": [
                1
            ],
            "safeFailureCode": [
                1
            ],
            "state": [
                1
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailHealthDetails": {
            "adminDailyCap": [
                21
            ],
            "campaignEligibility": [
                1
            ],
            "lastEvaluatedAt": [
                4
            ],
            "policySafeDailyCapacity": [
                21
            ],
            "safeFailureCode": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailActionResult": {
            "accepted": [
                6
            ],
            "operationId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceMailboxConnectionStatus": {
            "connectedAccountId": [
                3
            ],
            "errorCode": [
                1
            ],
            "errorMessage": [
                1
            ],
            "lastSafeOperation": [
                1
            ],
            "maskedHandle": [
                1
            ],
            "messageChannelId": [
                3
            ],
            "state": [
                1
            ],
            "syncStage": [
                1
            ],
            "syncStatus": [
                1
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceMailboxConnectionResult": {
            "connectedAccountId": [
                3
            ],
            "messageChannelId": [
                3
            ],
            "status": [
                311
            ],
            "__typename": [
                1
            ]
        },
        "RevokeWorkspaceMailboxResult": {
            "connectedAccountId": [
                3
            ],
            "revoked": [
                6
            ],
            "state": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "BillingTrialPeriod": {
            "duration": [
                12
            ],
            "isCreditCardRequired": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "NativeModelCapabilities": {
            "webSearch": [
                6
            ],
            "twitterSearch": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "ClientAiModelConfig": {
            "modelId": [
                1
            ],
            "label": [
                1
            ],
            "modelFamily": [
                317
            ],
            "modelFamilyLabel": [
                1
            ],
            "sdkPackage": [
                1
            ],
            "inputCostPerMillionTokens": [
                12
            ],
            "outputCostPerMillionTokens": [
                12
            ],
            "nativeCapabilities": [
                315
            ],
            "isDeprecated": [
                6
            ],
            "isRecommended": [
                6
            ],
            "providerName": [
                1
            ],
            "providerLabel": [
                1
            ],
            "contextWindowTokens": [
                12
            ],
            "maxOutputTokens": [
                12
            ],
            "dataResidency": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ModelFamily": {},
        "Billing": {
            "isBillingEnabled": [
                6
            ],
            "billingUrl": [
                1
            ],
            "stripePublishableKey": [
                1
            ],
            "trialPeriods": [
                314
            ],
            "__typename": [
                1
            ]
        },
        "Support": {
            "supportDriver": [
                320
            ],
            "supportFrontChatId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "SupportDriver": {},
        "Sentry": {
            "environment": [
                1
            ],
            "release": [
                1
            ],
            "dsn": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "Captcha": {
            "provider": [
                323
            ],
            "siteKey": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CaptchaDriverType": {},
        "ApiConfig": {
            "mutationMaximumAffectedRecords": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "PublicFeatureFlagMetadata": {
            "label": [
                1
            ],
            "description": [
                1
            ],
            "imagePath": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "PublicFeatureFlag": {
            "key": [
                262
            ],
            "metadata": [
                325
            ],
            "__typename": [
                1
            ]
        },
        "ClientConfigMaintenanceMode": {
            "startAt": [
                4
            ],
            "endAt": [
                4
            ],
            "link": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ClientConfig": {
            "appVersion": [
                1
            ],
            "authProviders": [
                264
            ],
            "billing": [
                318
            ],
            "aiModels": [
                316
            ],
            "signInPrefilled": [
                6
            ],
            "isMultiWorkspaceEnabled": [
                6
            ],
            "isEmailVerificationRequired": [
                6
            ],
            "defaultSubdomain": [
                1
            ],
            "frontDomain": [
                1
            ],
            "publicFunctionDomain": [
                1
            ],
            "analyticsEnabled": [
                6
            ],
            "support": [
                319
            ],
            "isAttachmentPreviewEnabled": [
                6
            ],
            "sentry": [
                321
            ],
            "captcha": [
                322
            ],
            "api": [
                324
            ],
            "canManageFeatureFlags": [
                6
            ],
            "publicFeatureFlags": [
                326
            ],
            "isMicrosoftMessagingEnabled": [
                6
            ],
            "isMicrosoftCalendarEnabled": [
                6
            ],
            "isGoogleMessagingEnabled": [
                6
            ],
            "isGoogleCalendarEnabled": [
                6
            ],
            "isConfigVariablesInDbEnabled": [
                6
            ],
            "isImapSmtpCaldavEnabled": [
                6
            ],
            "isManagedEmailEnabled": [
                6
            ],
            "isEmailingDomainInDemoMode": [
                6
            ],
            "allowRequestsToTwentyIcons": [
                6
            ],
            "calendarBookingPageId": [
                1
            ],
            "isCloudflareIntegrationEnabled": [
                6
            ],
            "isClickHouseConfigured": [
                6
            ],
            "isWorkspaceSchemaDDLLocked": [
                6
            ],
            "maintenance": [
                327
            ],
            "__typename": [
                1
            ]
        },
        "UsageBreakdownItem": {
            "key": [
                1
            ],
            "label": [
                1
            ],
            "creditsUsed": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "Impersonate": {
            "loginToken": [
                32
            ],
            "workspace": [
                278
            ],
            "__typename": [
                1
            ]
        },
        "UsageTimeSeries": {
            "date": [
                1
            ],
            "creditsUsed": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "UsageUserDaily": {
            "userWorkspaceId": [
                1
            ],
            "dailyUsage": [
                331
            ],
            "__typename": [
                1
            ]
        },
        "UsageAnalytics": {
            "usageByUser": [
                329
            ],
            "usageByOperationType": [
                329
            ],
            "usageByModel": [
                329
            ],
            "timeSeries": [
                331
            ],
            "periodStart": [
                4
            ],
            "periodEnd": [
                4
            ],
            "userDailyUsage": [
                332
            ],
            "__typename": [
                1
            ]
        },
        "DevelopmentApplication": {
            "id": [
                1
            ],
            "universalIdentifier": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceMigration": {
            "applicationUniversalIdentifier": [
                1
            ],
            "actions": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "File": {
            "id": [
                3
            ],
            "path": [
                1
            ],
            "size": [
                12
            ],
            "createdAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "PublicDomain": {
            "id": [
                3
            ],
            "domain": [
                1
            ],
            "isValidated": [
                6
            ],
            "applicationId": [
                3
            ],
            "createdAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "AutocompleteResult": {
            "text": [
                1
            ],
            "placeId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "Location": {
            "lat": [
                12
            ],
            "lng": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "PlaceDetailsResult": {
            "street": [
                1
            ],
            "state": [
                1
            ],
            "postcode": [
                1
            ],
            "city": [
                1
            ],
            "country": [
                1
            ],
            "location": [
                339
            ],
            "__typename": [
                1
            ]
        },
        "AgentMessagePart": {
            "id": [
                3
            ],
            "messageId": [
                3
            ],
            "orderIndex": [
                21
            ],
            "type": [
                1
            ],
            "textContent": [
                1
            ],
            "reasoningContent": [
                1
            ],
            "toolName": [
                1
            ],
            "toolCallId": [
                1
            ],
            "toolInput": [
                7
            ],
            "toolOutput": [
                7
            ],
            "state": [
                1
            ],
            "providerExecuted": [
                6
            ],
            "errorMessage": [
                1
            ],
            "errorDetails": [
                7
            ],
            "sourceUrlSourceId": [
                1
            ],
            "sourceUrlUrl": [
                1
            ],
            "sourceUrlTitle": [
                1
            ],
            "sourceDocumentSourceId": [
                1
            ],
            "sourceDocumentMediaType": [
                1
            ],
            "sourceDocumentTitle": [
                1
            ],
            "sourceDocumentFilename": [
                1
            ],
            "fileMediaType": [
                1
            ],
            "fileFilename": [
                1
            ],
            "fileId": [
                3
            ],
            "fileUrl": [
                1
            ],
            "providerMetadata": [
                7
            ],
            "createdAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "RunAgentResult": {
            "result": [
                7
            ],
            "error": [
                1
            ],
            "success": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "Webhook": {
            "id": [
                3
            ],
            "targetUrl": [
                1
            ],
            "operations": [
                1
            ],
            "description": [
                1
            ],
            "secret": [
                1
            ],
            "applicationId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "deletedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "ToolIndexEntry": {
            "name": [
                1
            ],
            "label": [
                1
            ],
            "description": [
                1
            ],
            "category": [
                1
            ],
            "objectName": [
                1
            ],
            "icon": [
                1
            ],
            "inputSchema": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "CampaignOutreachAudienceCreator": {
            "campaignCreatorId": [
                3
            ],
            "creatorId": [
                3
            ],
            "creatorName": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignOutreachAudienceExcludedCreator": {
            "campaignCreatorId": [
                3
            ],
            "creatorId": [
                3
            ],
            "creatorName": [
                1
            ],
            "reasons": [
                347
            ],
            "__typename": [
                1
            ]
        },
        "CampaignOutreachAudienceExclusionReason": {},
        "CampaignOutreachAudienceReview": {
            "state": [
                349
            ],
            "campaignId": [
                3
            ],
            "errorCode": [
                1
            ],
            "eligibleCount": [
                21
            ],
            "eligibleCreators": [
                345
            ],
            "excludedCount": [
                21
            ],
            "excludedCreators": [
                346
            ],
            "__typename": [
                1
            ]
        },
        "CampaignOutreachAudienceReviewState": {},
        "CampaignActivityMessageDTO": {
            "id": [
                238
            ],
            "threadId": [
                238
            ],
            "happenedAt": [
                1
            ],
            "state": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignActivityCreatorDTO": {
            "campaignCreatorId": [
                238
            ],
            "creatorId": [
                238
            ],
            "creatorName": [
                1
            ],
            "stage": [
                1
            ],
            "stageLabel": [
                1
            ],
            "latestOutbound": [
                350
            ],
            "latestInbound": [
                350
            ],
            "plannedAt": [
                1
            ],
            "currentAttemptState": [
                1
            ],
            "reason": [
                1
            ],
            "needsAttention": [
                6
            ],
            "inboxContactId": [
                1
            ],
            "inboxThreadId": [
                238
            ],
            "excluded": [
                6
            ],
            "mayStillSend": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "CampaignActivityPageInfoDTO": {
            "hasNextPage": [
                6
            ],
            "endCursor": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignActivityConnectionDTO": {
            "nodes": [
                351
            ],
            "pageInfo": [
                352
            ],
            "__typename": [
                1
            ]
        },
        "ExcludeCampaignCreatorResultDTO": {
            "status": [
                1
            ],
            "excludedAt": [
                1
            ],
            "mayStillSend": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "CampaignSendingWindowMutationResultDTO": {
            "status": [
                1
            ],
            "reason": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignExecutionMutationResultDTO": {
            "status": [
                1
            ],
            "lifecycleStatus": [
                1
            ],
            "reason": [
                1
            ],
            "replayed": [
                6
            ],
            "changed": [
                6
            ],
            "inFlightCount": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "CampaignMessageOverviewRowDTO": {
            "occurrenceId": [
                238
            ],
            "campaignId": [
                238
            ],
            "campaignName": [
                1
            ],
            "creatorId": [
                238
            ],
            "creatorName": [
                1
            ],
            "recipient": [
                1
            ],
            "subject": [
                1
            ],
            "preview": [
                1
            ],
            "sequenceStep": [
                21
            ],
            "platform": [
                1
            ],
            "status": [
                1
            ],
            "estimatedSendAt": [
                1
            ],
            "sentAt": [
                1
            ],
            "eligibleAfter": [
                1
            ],
            "connectedAccountId": [
                238
            ],
            "connectedAccountLabel": [
                1
            ],
            "senderIsEstimated": [
                6
            ],
            "needsAttention": [
                6
            ],
            "reason": [
                1
            ],
            "inboxContactId": [
                1
            ],
            "inboxThreadId": [
                238
            ],
            "__typename": [
                1
            ]
        },
        "CampaignMessageOverviewPageInfoDTO": {
            "hasNextPage": [
                6
            ],
            "endCursor": [
                1
            ],
            "generationId": [
                238
            ],
            "generatedAt": [
                1
            ],
            "horizonEndsAt": [
                1
            ],
            "forecastComplete": [
                6
            ],
            "refreshing": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "CampaignMessageOverviewConnectedAccountOptionDTO": {
            "id": [
                238
            ],
            "label": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignMessageOverviewFilterOptionsDTO": {
            "campaigns": [
                361
            ],
            "connectedAccounts": [
                359
            ],
            "connectedAccountIds": [
                238
            ],
            "__typename": [
                1
            ]
        },
        "CampaignMessageOverviewCampaignOptionDTO": {
            "id": [
                238
            ],
            "name": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignMessageOverviewConnectionDTO": {
            "nodes": [
                357
            ],
            "pageInfo": [
                358
            ],
            "filterOptions": [
                360
            ],
            "__typename": [
                1
            ]
        },
        "ChannelSyncSuccess": {
            "success": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "BarChartSeries": {
            "key": [
                1
            ],
            "label": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "BarChartData": {
            "data": [
                7
            ],
            "indexBy": [
                1
            ],
            "keys": [
                1
            ],
            "series": [
                364
            ],
            "xAxisLabel": [
                1
            ],
            "yAxisLabel": [
                1
            ],
            "showLegend": [
                6
            ],
            "showDataLabels": [
                6
            ],
            "layout": [
                102
            ],
            "groupMode": [
                101
            ],
            "hasTooManyGroups": [
                6
            ],
            "formattedToRawLookup": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "LineChartDataPoint": {
            "x": [
                1
            ],
            "y": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "LineChartSeries": {
            "key": [
                1
            ],
            "label": [
                1
            ],
            "data": [
                366
            ],
            "__typename": [
                1
            ]
        },
        "LineChartData": {
            "series": [
                367
            ],
            "xAxisLabel": [
                1
            ],
            "yAxisLabel": [
                1
            ],
            "showLegend": [
                6
            ],
            "showDataLabels": [
                6
            ],
            "hasTooManyGroups": [
                6
            ],
            "formattedToRawLookup": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "PieChartDataItem": {
            "key": [
                1
            ],
            "value": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "PieChartData": {
            "data": [
                369
            ],
            "showLegend": [
                6
            ],
            "showDataLabels": [
                6
            ],
            "showCenterMetric": [
                6
            ],
            "hasTooManyGroups": [
                6
            ],
            "formattedToRawLookup": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "DuplicatedDashboard": {
            "id": [
                3
            ],
            "title": [
                1
            ],
            "pageLayoutId": [
                3
            ],
            "position": [
                12
            ],
            "createdAt": [
                1
            ],
            "updatedAt": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "SendEmailOutput": {
            "success": [
                6
            ],
            "error": [
                1
            ],
            "messageThreadId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "Analytics": {
            "success": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "EventLogRecord": {
            "event": [
                1
            ],
            "timestamp": [
                4
            ],
            "userId": [
                1
            ],
            "properties": [
                7
            ],
            "recordId": [
                1
            ],
            "objectMetadataId": [
                1
            ],
            "isCustom": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "EventLogPageInfo": {
            "endCursor": [
                1
            ],
            "hasNextPage": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "EventLogQueryResult": {
            "records": [
                374
            ],
            "totalCount": [
                21
            ],
            "pageInfo": [
                375
            ],
            "__typename": [
                1
            ]
        },
        "Skill": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "label": [
                1
            ],
            "icon": [
                1
            ],
            "description": [
                1
            ],
            "content": [
                1
            ],
            "isCustom": [
                6
            ],
            "isActive": [
                6
            ],
            "applicationId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "AgentMessage": {
            "id": [
                3
            ],
            "threadId": [
                3
            ],
            "turnId": [
                3
            ],
            "agentId": [
                3
            ],
            "role": [
                1
            ],
            "status": [
                1
            ],
            "parts": [
                341
            ],
            "processedAt": [
                4
            ],
            "createdAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "AgentChatThread": {
            "id": [
                238
            ],
            "title": [
                1
            ],
            "totalInputTokens": [
                21
            ],
            "totalOutputTokens": [
                21
            ],
            "contextWindowTokens": [
                21
            ],
            "conversationSize": [
                21
            ],
            "totalInputCredits": [
                12
            ],
            "totalOutputCredits": [
                12
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "deletedAt": [
                4
            ],
            "lastMessageAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "AiSystemPromptSection": {
            "title": [
                1
            ],
            "content": [
                1
            ],
            "estimatedTokenCount": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "AiSystemPromptPreview": {
            "sections": [
                380
            ],
            "estimatedTokenCount": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "ChatStreamError": {
            "code": [
                1
            ],
            "message": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ChatStreamCatchupChunks": {
            "chunks": [
                7
            ],
            "maxSeq": [
                21
            ],
            "error": [
                382
            ],
            "__typename": [
                1
            ]
        },
        "SendChatMessageResult": {
            "messageId": [
                1
            ],
            "queued": [
                6
            ],
            "streamId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "AgentChatEvent": {
            "threadId": [
                1
            ],
            "event": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "AgentTurnEvaluation": {
            "id": [
                3
            ],
            "turnId": [
                3
            ],
            "score": [
                21
            ],
            "comment": [
                1
            ],
            "createdAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "AgentTurn": {
            "id": [
                3
            ],
            "threadId": [
                3
            ],
            "agentId": [
                3
            ],
            "evaluations": [
                386
            ],
            "messages": [
                378
            ],
            "createdAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceAiStats": {
            "conversationsCount": [
                21
            ],
            "skillsCount": [
                21
            ],
            "toolsCount": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "CalendarChannel": {
            "id": [
                3
            ],
            "handle": [
                1
            ],
            "syncStatus": [
                390
            ],
            "syncStage": [
                391
            ],
            "visibility": [
                392
            ],
            "isContactAutoCreationEnabled": [
                6
            ],
            "contactAutoCreationPolicy": [
                393
            ],
            "isSyncEnabled": [
                6
            ],
            "syncedAt": [
                4
            ],
            "syncStageStartedAt": [
                4
            ],
            "throttleFailureCount": [
                12
            ],
            "connectedAccountId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "CalendarChannelSyncStatus": {},
        "CalendarChannelSyncStage": {},
        "CalendarChannelVisibility": {},
        "CalendarChannelContactAutoCreationPolicy": {},
        "MessageFolder": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "isSentFolder": [
                6
            ],
            "isSynced": [
                6
            ],
            "parentFolderId": [
                1
            ],
            "externalId": [
                1
            ],
            "pendingSyncAction": [
                395
            ],
            "messageChannelId": [
                3
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "MessageFolderPendingSyncAction": {},
        "CollectionHash": {
            "collectionName": [
                397
            ],
            "hash": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "AllMetadataName": {},
        "MinimalObjectMetadata": {
            "id": [
                3
            ],
            "nameSingular": [
                1
            ],
            "namePlural": [
                1
            ],
            "labelSingular": [
                1
            ],
            "labelPlural": [
                1
            ],
            "icon": [
                1
            ],
            "color": [
                1
            ],
            "isActive": [
                6
            ],
            "isSystem": [
                6
            ],
            "isRemote": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "MinimalView": {
            "id": [
                3
            ],
            "universalIdentifier": [
                3
            ],
            "type": [
                67
            ],
            "key": [
                68
            ],
            "objectMetadataId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "MinimalMetadata": {
            "objectMetadataItems": [
                398
            ],
            "views": [
                399
            ],
            "collectionHashes": [
                396
            ],
            "__typename": [
                1
            ]
        },
        "Query": {
            "getWorkspaceMailboxStatus": [
                311,
                {
                    "connectedAccountId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "navigationMenuItems": [
                184
            ],
            "navigationMenuItem": [
                184,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "enterprisePortalSession": [
                1,
                {
                    "returnUrlPath": [
                        1
                    ]
                }
            ],
            "enterpriseCheckoutSession": [
                1,
                {
                    "billingInterval": [
                        1
                    ]
                }
            ],
            "enterpriseSubscriptionStatus": [
                126
            ],
            "managedEmailOverview": [
                294
            ],
            "managedEmailDomains": [
                295
            ],
            "managedEmailMailboxes": [
                296
            ],
            "managedEmailSubscriptions": [
                307
            ],
            "managedEmailPrewarmedBundles": [
                298
            ],
            "managedEmailProposal": [
                302,
                {
                    "input": [
                        402,
                        "ManagedEmailProposalInput!"
                    ]
                }
            ],
            "managedEmailQuote": [
                304,
                {
                    "input": [
                        404,
                        "ManagedEmailQuoteInput!"
                    ]
                }
            ],
            "managedEmailPrewarmedProposal": [
                302,
                {
                    "input": [
                        405,
                        "ManagedEmailPrewarmedProposalInput!"
                    ]
                }
            ],
            "managedEmailOperation": [
                308,
                {
                    "input": [
                        406,
                        "ManagedEmailOperationInput!"
                    ]
                }
            ],
            "managedEmailHealthDetails": [
                309,
                {
                    "input": [
                        407,
                        "ManagedEmailHealthDetailsInput!"
                    ]
                }
            ],
            "getConnectedImapSmtpCaldavAccount": [
                292,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "applicationConnectionProviders": [
                124,
                {
                    "applicationId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "checkUserExists": [
                288,
                {
                    "email": [
                        1,
                        "String!"
                    ],
                    "captchaToken": [
                        1
                    ]
                }
            ],
            "checkWorkspaceInviteHashIsValid": [
                289,
                {
                    "inviteHash": [
                        1,
                        "String!"
                    ]
                }
            ],
            "findWorkspaceFromInviteHash": [
                72,
                {
                    "inviteHash": [
                        1,
                        "String!"
                    ]
                }
            ],
            "checkWorkspaceSubdomainAvailability": [
                283,
                {
                    "subdomain": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getWorkspaceCreationDefaults": [
                284
            ],
            "validatePasswordResetToken": [
                281,
                {
                    "passwordResetToken": [
                        1,
                        "String!"
                    ]
                }
            ],
            "managedProviderBillingStatus": [
                158
            ],
            "managedProviderCustomerFundingAction": [
                155,
                {
                    "actionId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "billingPortalSession": [
                148,
                {
                    "returnUrlPath": [
                        1
                    ],
                    "forPaymentMethodUpdate": [
                        6
                    ]
                }
            ],
            "listPlans": [
                146
            ],
            "getResourceCreditUsage": [
                145
            ],
            "appConnections": [
                237,
                {
                    "filter": [
                        408
                    ]
                }
            ],
            "appConnection": [
                237,
                {
                    "id": [
                        238,
                        "ID!"
                    ]
                }
            ],
            "findApplicationRegistrationByClientId": [
                231,
                {
                    "clientId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "findApplicationRegistrationByUniversalIdentifier": [
                8,
                {
                    "universalIdentifier": [
                        1,
                        "String!"
                    ]
                }
            ],
            "findManyApplicationRegistrations": [
                8
            ],
            "findOneApplicationRegistration": [
                8,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "findApplicationRegistrationStats": [
                229,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "findApplicationRegistrationVariables": [
                233,
                {
                    "applicationRegistrationId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "applicationRegistrationTarballUrl": [
                1,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "field": [
                43,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "fields": [
                236,
                {
                    "paging": [
                        47,
                        "CursorPaging!"
                    ],
                    "filter": [
                        53,
                        "FieldFilter!"
                    ]
                }
            ],
            "index": [
                45,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "indexMetadatas": [
                199,
                {
                    "paging": [
                        47,
                        "CursorPaging!"
                    ],
                    "filter": [
                        54,
                        "IndexFilter!"
                    ]
                }
            ],
            "getViewGroups": [
                62,
                {
                    "viewId": [
                        1
                    ]
                }
            ],
            "getViewGroup": [
                62,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewFilters": [
                60,
                {
                    "viewId": [
                        1
                    ]
                }
            ],
            "getViewFilter": [
                60,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewFields": [
                56,
                {
                    "viewId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewField": [
                56,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViews": [
                66,
                {
                    "objectMetadataId": [
                        1
                    ],
                    "viewTypes": [
                        67,
                        "[ViewType!]"
                    ]
                }
            ],
            "getView": [
                66,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewSorts": [
                63,
                {
                    "viewId": [
                        1
                    ]
                }
            ],
            "getViewSort": [
                63,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewFieldGroups": [
                65,
                {
                    "viewId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewFieldGroup": [
                65,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "objectRecordCounts": [
                202
            ],
            "object": [
                52,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "objects": [
                204,
                {
                    "paging": [
                        47,
                        "CursorPaging!"
                    ],
                    "filter": [
                        49,
                        "ObjectFilter!"
                    ]
                }
            ],
            "apiKeys": [
                2
            ],
            "apiKey": [
                2,
                {
                    "input": [
                        409,
                        "GetApiKeyInput!"
                    ]
                }
            ],
            "currentUser": [
                76
            ],
            "findWorkspaceInvitations": [
                223
            ],
            "getApprovedAccessDomains": [
                221
            ],
            "myConnectedAccounts": [
                165
            ],
            "currentWorkspace": [
                72
            ],
            "getPublicWorkspaceDataByDomain": [
                266,
                {
                    "origin": [
                        1
                    ]
                }
            ],
            "getPublicWorkspaceDataById": [
                267,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getViewFilterGroups": [
                58,
                {
                    "viewId": [
                        1
                    ]
                }
            ],
            "getViewFilterGroup": [
                58,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "campaignInfluencerSnapshot": [
                216,
                {
                    "input": [
                        410,
                        "CampaignInfluencerCampaignInput!"
                    ]
                }
            ],
            "campaignCreatorListRemovalImpact": [
                217,
                {
                    "input": [
                        411,
                        "CampaignCreatorListRemovalImpactInput!"
                    ]
                }
            ],
            "campaignCreatorListAdditionCandidates": [
                218,
                {
                    "input": [
                        412,
                        "CampaignCreatorListAdditionCandidatesInput!"
                    ]
                }
            ],
            "creatorListMembershipRemovalImpact": [
                220,
                {
                    "input": [
                        413,
                        "CreatorListMembershipIntentInput!"
                    ]
                }
            ],
            "campaignEmailAccounts": [
                212,
                {
                    "input": [
                        414,
                        "CampaignEmailAccountCampaignInput!"
                    ]
                }
            ],
            "campaignEmailAccountCandidates": [
                212,
                {
                    "input": [
                        414,
                        "CampaignEmailAccountCampaignInput!"
                    ]
                }
            ],
            "campaignEmailSenderPool": [
                209,
                {
                    "input": [
                        414,
                        "CampaignEmailAccountCampaignInput!"
                    ]
                }
            ],
            "exactCampaignEmailSender": [
                210,
                {
                    "input": [
                        415,
                        "ResolveExactCampaignEmailSenderInput!"
                    ]
                }
            ],
            "previewMessageCampaignAudience": [
                175,
                {
                    "input": [
                        416,
                        "PreviewMessageCampaignAudienceInput!"
                    ]
                }
            ],
            "unsubscribeTopics": [
                179
            ],
            "unsubscribePagePreviewUrl": [
                1
            ],
            "myMessageChannels": [
                166,
                {
                    "connectedAccountId": [
                        3
                    ]
                }
            ],
            "getEmailingDomains": [
                160
            ],
            "commandMenuItems": [
                35
            ],
            "commandMenuItem": [
                35,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "frontComponents": [
                34
            ],
            "frontComponent": [
                34,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "findOneLogicFunction": [
                41,
                {
                    "input": [
                        417,
                        "LogicFunctionIdInput!"
                    ]
                }
            ],
            "findManyLogicFunctions": [
                41
            ],
            "getAvailablePackages": [
                7,
                {
                    "input": [
                        417,
                        "LogicFunctionIdInput!"
                    ]
                }
            ],
            "getLogicFunctionSourceCode": [
                1,
                {
                    "input": [
                        417,
                        "LogicFunctionIdInput!"
                    ]
                }
            ],
            "getPageLayoutTabs": [
                120,
                {
                    "pageLayoutId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getPageLayoutTab": [
                120,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getPageLayouts": [
                121,
                {
                    "objectMetadataId": [
                        1
                    ],
                    "pageLayoutType": [
                        122
                    ]
                }
            ],
            "getPageLayout": [
                121,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "findManyApplications": [
                55
            ],
            "findOneApplication": [
                55,
                {
                    "id": [
                        3
                    ],
                    "universalIdentifier": [
                        3
                    ]
                }
            ],
            "findManyMarketplaceApps": [
                252
            ],
            "findMarketplaceAppDetail": [
                256,
                {
                    "universalIdentifier": [
                        1,
                        "String!"
                    ]
                }
            ],
            "findManyAgents": [
                25
            ],
            "findOneAgent": [
                25,
                {
                    "input": [
                        418,
                        "AgentIdInput!"
                    ]
                }
            ],
            "getRoles": [
                29
            ],
            "getSSOIdentityProviders": [
                245
            ],
            "getPageLayoutWidgets": [
                82,
                {
                    "pageLayoutTabId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getPageLayoutWidget": [
                82,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getToolIndex": [
                344
            ],
            "getToolInputSchema": [
                7,
                {
                    "toolName": [
                        1,
                        "String!"
                    ]
                }
            ],
            "webhooks": [
                343
            ],
            "webhook": [
                343,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getActionApprovalProposal": [
                226,
                {
                    "bindingId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getActionExecutionReceipt": [
                227,
                {
                    "bindingId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "myMessageFolders": [
                394,
                {
                    "messageChannelId": [
                        3
                    ]
                }
            ],
            "myCalendarChannels": [
                389,
                {
                    "connectedAccountId": [
                        3
                    ]
                }
            ],
            "minimalMetadata": [
                400
            ],
            "findWorkspaceAiStats": [
                388
            ],
            "chatThreads": [
                379
            ],
            "chatThread": [
                379,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "chatMessages": [
                378,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "chatStreamCatchupChunks": [
                383,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getAiSystemPromptPreview": [
                381
            ],
            "skills": [
                377
            ],
            "skill": [
                377,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "agentTurns": [
                387,
                {
                    "agentId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "eventLogs": [
                376,
                {
                    "input": [
                        419,
                        "EventLogQueryInput!"
                    ]
                }
            ],
            "pieChartData": [
                370,
                {
                    "input": [
                        423,
                        "PieChartDataInput!"
                    ]
                }
            ],
            "lineChartData": [
                368,
                {
                    "input": [
                        424,
                        "LineChartDataInput!"
                    ]
                }
            ],
            "barChartData": [
                365,
                {
                    "input": [
                        425,
                        "BarChartDataInput!"
                    ]
                }
            ],
            "campaignActivity": [
                353,
                {
                    "input": [
                        426,
                        "CampaignActivityInput!"
                    ]
                }
            ],
            "campaignMessageOverview": [
                362,
                {
                    "input": [
                        427,
                        "CampaignMessageOverviewInput!"
                    ]
                }
            ],
            "campaignMessageOverviewDetail": [
                357,
                {
                    "input": [
                        430,
                        "CampaignMessageOverviewDetailInput!"
                    ]
                }
            ],
            "campaignOutreachAudienceReview": [
                348,
                {
                    "campaignId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getAutoCompleteAddress": [
                338,
                {
                    "address": [
                        1,
                        "String!"
                    ],
                    "token": [
                        1,
                        "String!"
                    ],
                    "country": [
                        1
                    ],
                    "isFieldCity": [
                        6
                    ]
                }
            ],
            "getAddressDetails": [
                340,
                {
                    "placeId": [
                        1,
                        "String!"
                    ],
                    "token": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getUsageAnalytics": [
                333,
                {
                    "input": [
                        431
                    ]
                }
            ],
            "findManyPublicDomains": [
                337
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailProposalInput": {
            "mailboxCount": [
                21
            ],
            "personas": [
                403
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailPersonaInput": {
            "displayName": [
                1
            ],
            "localPartPreference": [
                1
            ],
            "roleTitle": [
                1
            ],
            "signature": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailQuoteInput": {
            "proposalId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailPrewarmedProposalInput": {
            "bundleId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailOperationInput": {
            "operationId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailHealthDetailsInput": {
            "resourceType": [
                1
            ],
            "resourceId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ListAppConnectionsInput": {
            "providerName": [
                1
            ],
            "userWorkspaceId": [
                1
            ],
            "visibility": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "GetApiKeyInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CampaignInfluencerCampaignInput": {
            "campaignId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CampaignCreatorListRemovalImpactInput": {
            "campaignId": [
                3
            ],
            "creatorListId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CampaignCreatorListAdditionCandidatesInput": {
            "campaignId": [
                3
            ],
            "creatorListId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CreatorListMembershipIntentInput": {
            "creatorListId": [
                3
            ],
            "creatorId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CampaignEmailAccountCampaignInput": {
            "campaignId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "ResolveExactCampaignEmailSenderInput": {
            "campaignId": [
                3
            ],
            "connectedAccountId": [
                3
            ],
            "expectedSenderPoolFingerprint": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "PreviewMessageCampaignAudienceInput": {
            "listId": [
                1
            ],
            "unsubscribeTopicId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "LogicFunctionIdInput": {
            "id": [
                238
            ],
            "__typename": [
                1
            ]
        },
        "AgentIdInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "EventLogQueryInput": {
            "table": [
                420
            ],
            "filters": [
                421
            ],
            "first": [
                21
            ],
            "after": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "EventLogTable": {},
        "EventLogFiltersInput": {
            "eventType": [
                1
            ],
            "userWorkspaceId": [
                1
            ],
            "dateRange": [
                422
            ],
            "recordId": [
                1
            ],
            "objectMetadataId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "EventLogDateRangeInput": {
            "start": [
                4
            ],
            "end": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "PieChartDataInput": {
            "objectMetadataId": [
                3
            ],
            "configuration": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "LineChartDataInput": {
            "objectMetadataId": [
                3
            ],
            "configuration": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "BarChartDataInput": {
            "objectMetadataId": [
                3
            ],
            "configuration": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "CampaignActivityInput": {
            "campaignId": [
                238
            ],
            "first": [
                21
            ],
            "after": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignMessageOverviewInput": {
            "first": [
                21
            ],
            "after": [
                1
            ],
            "view": [
                428
            ],
            "campaignIds": [
                238
            ],
            "connectedAccountIds": [
                238
            ],
            "search": [
                1
            ],
            "dateBasis": [
                429
            ],
            "dateFrom": [
                1
            ],
            "dateTo": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CampaignMessageOverviewView": {},
        "CampaignMessageOverviewDateBasis": {},
        "CampaignMessageOverviewDetailInput": {
            "occurrenceId": [
                238
            ],
            "__typename": [
                1
            ]
        },
        "UsageAnalyticsInput": {
            "periodStart": [
                4
            ],
            "periodEnd": [
                4
            ],
            "userWorkspaceId": [
                1
            ],
            "operationTypes": [
                432
            ],
            "__typename": [
                1
            ]
        },
        "UsageOperationType": {},
        "Mutation": {
            "connectWorkspaceMailbox": [
                312,
                {
                    "input": [
                        434,
                        "ConnectWorkspaceMailboxInput!"
                    ]
                }
            ],
            "rotateWorkspaceMailbox": [
                312,
                {
                    "input": [
                        437,
                        "ReplaceWorkspaceMailboxCredentialsInput!"
                    ]
                }
            ],
            "reconnectWorkspaceMailbox": [
                312,
                {
                    "input": [
                        437,
                        "ReplaceWorkspaceMailboxCredentialsInput!"
                    ]
                }
            ],
            "revokeWorkspaceMailbox": [
                313,
                {
                    "connectedAccountId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "addQueryToEventStream": [
                6,
                {
                    "input": [
                        438,
                        "AddQuerySubscriptionInput!"
                    ]
                }
            ],
            "removeQueryFromEventStream": [
                6,
                {
                    "input": [
                        439,
                        "RemoveQueryFromEventStreamInput!"
                    ]
                }
            ],
            "createManyNavigationMenuItems": [
                184,
                {
                    "inputs": [
                        440,
                        "[CreateNavigationMenuItemInput!]!"
                    ]
                }
            ],
            "createNavigationMenuItem": [
                184,
                {
                    "input": [
                        440,
                        "CreateNavigationMenuItemInput!"
                    ]
                }
            ],
            "updateManyNavigationMenuItems": [
                184,
                {
                    "inputs": [
                        441,
                        "[UpdateOneNavigationMenuItemInput!]!"
                    ]
                }
            ],
            "updateNavigationMenuItem": [
                184,
                {
                    "input": [
                        441,
                        "UpdateOneNavigationMenuItemInput!"
                    ]
                }
            ],
            "deleteManyNavigationMenuItems": [
                184,
                {
                    "ids": [
                        3,
                        "[UUID!]!"
                    ]
                }
            ],
            "deleteNavigationMenuItem": [
                184,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createFileUpload": [
                182,
                {
                    "filename": [
                        1,
                        "String!"
                    ],
                    "size": [
                        12,
                        "Float!"
                    ],
                    "fileFolder": [
                        443,
                        "FileFolder!"
                    ],
                    "fieldMetadataId": [
                        1
                    ],
                    "fieldMetadataUniversalIdentifier": [
                        1
                    ]
                }
            ],
            "completeFileUpload": [
                181,
                {
                    "fileId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "refreshEnterpriseValidityToken": [
                6
            ],
            "setEnterpriseKey": [
                125,
                {
                    "enterpriseKey": [
                        1,
                        "String!"
                    ]
                }
            ],
            "uploadEmailAttachmentFile": [
                181,
                {
                    "file": [
                        444,
                        "Upload!"
                    ]
                }
            ],
            "uploadAiChatFile": [
                181,
                {
                    "file": [
                        444,
                        "Upload!"
                    ]
                }
            ],
            "uploadWorkflowFile": [
                181,
                {
                    "file": [
                        444,
                        "Upload!"
                    ]
                }
            ],
            "uploadWorkspaceLogo": [
                181,
                {
                    "file": [
                        444,
                        "Upload!"
                    ]
                }
            ],
            "uploadWorkspaceMemberProfilePicture": [
                181,
                {
                    "file": [
                        444,
                        "Upload!"
                    ]
                }
            ],
            "uploadFilesFieldFile": [
                181,
                {
                    "file": [
                        444,
                        "Upload!"
                    ],
                    "fieldMetadataId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "uploadFilesFieldFileByUniversalIdentifier": [
                181,
                {
                    "file": [
                        444,
                        "Upload!"
                    ],
                    "fieldMetadataUniversalIdentifier": [
                        1,
                        "String!"
                    ]
                }
            ],
            "prepareManagedEmailPaymentMethod": [
                305
            ],
            "completeManagedEmailPaymentMethod": [
                306,
                {
                    "input": [
                        445,
                        "ManagedEmailCompletePaymentMethodInput!"
                    ]
                }
            ],
            "confirmManagedEmailPrewarmedPurchase": [
                310,
                {
                    "input": [
                        446,
                        "ManagedEmailPurchaseInput!"
                    ]
                }
            ],
            "confirmManagedEmailOrdinaryPurchase": [
                310,
                {
                    "input": [
                        446,
                        "ManagedEmailPurchaseInput!"
                    ]
                }
            ],
            "setManagedEmailCampaignCap": [
                310,
                {
                    "input": [
                        447,
                        "ManagedEmailCampaignCapInput!"
                    ]
                }
            ],
            "cancelManagedEmailWarmup": [
                310,
                {
                    "input": [
                        448,
                        "ManagedEmailMailboxActionInput!"
                    ]
                }
            ],
            "pauseManagedEmailWarmup": [
                310,
                {
                    "input": [
                        448,
                        "ManagedEmailMailboxActionInput!"
                    ]
                }
            ],
            "resumeManagedEmailWarmup": [
                310,
                {
                    "input": [
                        448,
                        "ManagedEmailMailboxActionInput!"
                    ]
                }
            ],
            "stopManagedEmailMailbox": [
                310,
                {
                    "input": [
                        448,
                        "ManagedEmailMailboxActionInput!"
                    ]
                }
            ],
            "cancelManagedEmailDomainRenewal": [
                310,
                {
                    "input": [
                        449,
                        "ManagedEmailDomainActionInput!"
                    ]
                }
            ],
            "saveImapSmtpCaldavAccount": [
                293,
                {
                    "handle": [
                        1,
                        "String!"
                    ],
                    "connectionParameters": [
                        450,
                        "EmailAccountConnectionParameters!"
                    ],
                    "id": [
                        3
                    ]
                }
            ],
            "updateOneApplicationVariable": [
                6,
                {
                    "key": [
                        1,
                        "String!"
                    ],
                    "value": [
                        1,
                        "String!"
                    ],
                    "applicationId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getAuthorizationUrlForSSO": [
                276,
                {
                    "input": [
                        452,
                        "GetAuthorizationUrlForSSOInput!"
                    ]
                }
            ],
            "getLoginTokenFromCredentials": [
                287,
                {
                    "email": [
                        1,
                        "String!"
                    ],
                    "password": [
                        1,
                        "String!"
                    ],
                    "captchaToken": [
                        1
                    ],
                    "locale": [
                        1
                    ],
                    "verifyEmailRedirectPath": [
                        1
                    ],
                    "origin": [
                        1,
                        "String!"
                    ]
                }
            ],
            "signIn": [
                274,
                {
                    "email": [
                        1,
                        "String!"
                    ],
                    "password": [
                        1,
                        "String!"
                    ],
                    "captchaToken": [
                        1
                    ],
                    "locale": [
                        1
                    ],
                    "verifyEmailRedirectPath": [
                        1
                    ]
                }
            ],
            "verifyEmailAndGetLoginToken": [
                282,
                {
                    "emailVerificationToken": [
                        1,
                        "String!"
                    ],
                    "email": [
                        1,
                        "String!"
                    ],
                    "captchaToken": [
                        1
                    ],
                    "origin": [
                        1,
                        "String!"
                    ]
                }
            ],
            "verifyEmailAndGetWorkspaceAgnosticToken": [
                274,
                {
                    "emailVerificationToken": [
                        1,
                        "String!"
                    ],
                    "email": [
                        1,
                        "String!"
                    ],
                    "captchaToken": [
                        1
                    ]
                }
            ],
            "getAuthTokensFromOTP": [
                286,
                {
                    "otp": [
                        1,
                        "String!"
                    ],
                    "loginToken": [
                        1,
                        "String!"
                    ],
                    "captchaToken": [
                        1
                    ],
                    "origin": [
                        1,
                        "String!"
                    ]
                }
            ],
            "signUp": [
                274,
                {
                    "email": [
                        1,
                        "String!"
                    ],
                    "password": [
                        1,
                        "String!"
                    ],
                    "captchaToken": [
                        1
                    ],
                    "locale": [
                        1
                    ],
                    "verifyEmailRedirectPath": [
                        1
                    ]
                }
            ],
            "signUpInWorkspace": [
                279,
                {
                    "email": [
                        1,
                        "String!"
                    ],
                    "password": [
                        1,
                        "String!"
                    ],
                    "workspaceId": [
                        3
                    ],
                    "workspaceInviteHash": [
                        1
                    ],
                    "workspacePersonalInviteToken": [
                        1
                    ],
                    "captchaToken": [
                        1
                    ],
                    "locale": [
                        1
                    ],
                    "verifyEmailRedirectPath": [
                        1
                    ]
                }
            ],
            "signUpInNewWorkspace": [
                279,
                {
                    "input": [
                        453
                    ]
                }
            ],
            "uploadNewWorkspaceLogo": [
                181,
                {
                    "workspaceId": [
                        1,
                        "String!"
                    ],
                    "file": [
                        444,
                        "Upload!"
                    ]
                }
            ],
            "generateTransientToken": [
                280
            ],
            "getAuthTokensFromLoginToken": [
                286,
                {
                    "loginToken": [
                        1,
                        "String!"
                    ],
                    "origin": [
                        1,
                        "String!"
                    ]
                }
            ],
            "authorizeApp": [
                272,
                {
                    "clientId": [
                        1,
                        "String!"
                    ],
                    "codeChallenge": [
                        1
                    ],
                    "redirectUrl": [
                        1,
                        "String!"
                    ],
                    "state": [
                        1
                    ],
                    "scope": [
                        1
                    ]
                }
            ],
            "renewToken": [
                286,
                {
                    "appToken": [
                        1,
                        "String!"
                    ]
                }
            ],
            "generateApiKeyToken": [
                285,
                {
                    "apiKeyId": [
                        3,
                        "UUID!"
                    ],
                    "expiresAt": [
                        1,
                        "String!"
                    ]
                }
            ],
            "generatePlaygroundToken": [
                32
            ],
            "emailPasswordResetLink": [
                275,
                {
                    "email": [
                        1,
                        "String!"
                    ],
                    "workspaceId": [
                        3
                    ]
                }
            ],
            "updatePasswordViaResetToken": [
                277,
                {
                    "passwordResetToken": [
                        1,
                        "String!"
                    ],
                    "newPassword": [
                        1,
                        "String!"
                    ]
                }
            ],
            "requestManagedProviderCustomerFunding": [
                155,
                {
                    "principalCents": [
                        21,
                        "Int!"
                    ],
                    "idempotencyKey": [
                        1,
                        "String!"
                    ]
                }
            ],
            "prepareManagedProviderCustomerFundingPaymentMethod": [
                156,
                {
                    "replaceExistingPaymentMethod": [
                        6
                    ]
                }
            ],
            "completeManagedProviderCustomerFundingPaymentMethod": [
                156,
                {
                    "setupIntentId": [
                        1
                    ],
                    "name": [
                        1,
                        "String!"
                    ],
                    "line1": [
                        1,
                        "String!"
                    ],
                    "line2": [
                        1
                    ],
                    "city": [
                        1,
                        "String!"
                    ],
                    "state": [
                        1
                    ],
                    "postalCode": [
                        1,
                        "String!"
                    ],
                    "country": [
                        1,
                        "String!"
                    ],
                    "taxIdType": [
                        1
                    ],
                    "taxIdValue": [
                        1
                    ]
                }
            ],
            "prepareManagedProviderCustomerFundingPaymentAction": [
                157,
                {
                    "actionId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "acknowledgeManagedProviderCustomerFundingPaymentAction": [
                155,
                {
                    "actionId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "checkoutSession": [
                148,
                {
                    "recurringInterval": [
                        134,
                        "SubscriptionInterval!"
                    ],
                    "plan": [
                        130,
                        "BillingPlanKey!"
                    ],
                    "requirePaymentMethod": [
                        6,
                        "Boolean!"
                    ],
                    "successUrlPath": [
                        1
                    ]
                }
            ],
            "createSubscriptionPaymentIntent": [
                147,
                {
                    "recurringInterval": [
                        134,
                        "SubscriptionInterval!"
                    ],
                    "plan": [
                        130,
                        "BillingPlanKey!"
                    ],
                    "requirePaymentMethod": [
                        6,
                        "Boolean!"
                    ],
                    "successUrlPath": [
                        1
                    ],
                    "idempotencyKey": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createBillingPaymentMethodSetupIntent": [
                147
            ],
            "switchSubscriptionInterval": [
                149
            ],
            "switchBillingPlan": [
                149
            ],
            "cancelSwitchBillingPlan": [
                149
            ],
            "cancelSwitchBillingInterval": [
                149
            ],
            "setResourceCreditSubscriptionPrice": [
                149,
                {
                    "priceId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "endSubscriptionTrialPeriod": [
                144
            ],
            "cancelSwitchResourceCreditPrice": [
                149
            ],
            "createApplicationRegistration": [
                230,
                {
                    "input": [
                        454,
                        "CreateApplicationRegistrationInput!"
                    ]
                }
            ],
            "updateApplicationRegistration": [
                8,
                {
                    "input": [
                        455,
                        "UpdateApplicationRegistrationInput!"
                    ]
                }
            ],
            "deleteApplicationRegistration": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "rotateApplicationRegistrationClientSecret": [
                232,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createApplicationRegistrationVariable": [
                5,
                {
                    "input": [
                        457,
                        "CreateApplicationRegistrationVariableInput!"
                    ]
                }
            ],
            "updateApplicationRegistrationVariable": [
                5,
                {
                    "input": [
                        458,
                        "UpdateApplicationRegistrationVariableInput!"
                    ]
                }
            ],
            "deleteApplicationRegistrationVariable": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "uploadAppTarball": [
                8,
                {
                    "file": [
                        444,
                        "Upload!"
                    ],
                    "universalIdentifier": [
                        1
                    ]
                }
            ],
            "transferApplicationRegistrationOwnership": [
                8,
                {
                    "applicationRegistrationId": [
                        1,
                        "String!"
                    ],
                    "targetWorkspaceSubdomain": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createOneField": [
                43,
                {
                    "input": [
                        460,
                        "CreateOneFieldMetadataInput!"
                    ]
                }
            ],
            "updateOneField": [
                43,
                {
                    "input": [
                        462,
                        "UpdateOneFieldMetadataInput!"
                    ]
                }
            ],
            "deleteOneField": [
                43,
                {
                    "input": [
                        464,
                        "DeleteOneFieldInput!"
                    ]
                }
            ],
            "createOneIndex": [
                45,
                {
                    "input": [
                        465,
                        "CreateOneIndexInput!"
                    ]
                }
            ],
            "deleteOneIndex": [
                45,
                {
                    "input": [
                        468,
                        "DeleteOneIndexInput!"
                    ]
                }
            ],
            "createViewGroup": [
                62,
                {
                    "input": [
                        469,
                        "CreateViewGroupInput!"
                    ]
                }
            ],
            "createManyViewGroups": [
                62,
                {
                    "inputs": [
                        469,
                        "[CreateViewGroupInput!]!"
                    ]
                }
            ],
            "updateViewGroup": [
                62,
                {
                    "input": [
                        470,
                        "UpdateViewGroupInput!"
                    ]
                }
            ],
            "updateManyViewGroups": [
                62,
                {
                    "inputs": [
                        470,
                        "[UpdateViewGroupInput!]!"
                    ]
                }
            ],
            "deleteViewGroup": [
                62,
                {
                    "input": [
                        472,
                        "DeleteViewGroupInput!"
                    ]
                }
            ],
            "destroyViewGroup": [
                62,
                {
                    "input": [
                        473,
                        "DestroyViewGroupInput!"
                    ]
                }
            ],
            "createViewFilter": [
                60,
                {
                    "input": [
                        474,
                        "CreateViewFilterInput!"
                    ]
                }
            ],
            "updateViewFilter": [
                60,
                {
                    "input": [
                        475,
                        "UpdateViewFilterInput!"
                    ]
                }
            ],
            "deleteViewFilter": [
                60,
                {
                    "input": [
                        477,
                        "DeleteViewFilterInput!"
                    ]
                }
            ],
            "destroyViewFilter": [
                60,
                {
                    "input": [
                        478,
                        "DestroyViewFilterInput!"
                    ]
                }
            ],
            "updateViewField": [
                56,
                {
                    "input": [
                        479,
                        "UpdateViewFieldInput!"
                    ]
                }
            ],
            "createViewField": [
                56,
                {
                    "input": [
                        481,
                        "CreateViewFieldInput!"
                    ]
                }
            ],
            "createManyViewFields": [
                56,
                {
                    "inputs": [
                        481,
                        "[CreateViewFieldInput!]!"
                    ]
                }
            ],
            "deleteViewField": [
                56,
                {
                    "input": [
                        482,
                        "DeleteViewFieldInput!"
                    ]
                }
            ],
            "destroyViewField": [
                56,
                {
                    "input": [
                        483,
                        "DestroyViewFieldInput!"
                    ]
                }
            ],
            "createView": [
                66,
                {
                    "input": [
                        484,
                        "CreateViewInput!"
                    ]
                }
            ],
            "updateView": [
                66,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        485,
                        "UpdateViewInput!"
                    ]
                }
            ],
            "deleteView": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "destroyView": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "upsertViewWidget": [
                66,
                {
                    "input": [
                        486,
                        "UpsertViewWidgetInput!"
                    ]
                }
            ],
            "createViewSort": [
                63,
                {
                    "input": [
                        491,
                        "CreateViewSortInput!"
                    ]
                }
            ],
            "updateViewSort": [
                63,
                {
                    "input": [
                        492,
                        "UpdateViewSortInput!"
                    ]
                }
            ],
            "deleteViewSort": [
                6,
                {
                    "input": [
                        494,
                        "DeleteViewSortInput!"
                    ]
                }
            ],
            "destroyViewSort": [
                6,
                {
                    "input": [
                        495,
                        "DestroyViewSortInput!"
                    ]
                }
            ],
            "updateViewFieldGroup": [
                65,
                {
                    "input": [
                        496,
                        "UpdateViewFieldGroupInput!"
                    ]
                }
            ],
            "createViewFieldGroup": [
                65,
                {
                    "input": [
                        498,
                        "CreateViewFieldGroupInput!"
                    ]
                }
            ],
            "createManyViewFieldGroups": [
                65,
                {
                    "inputs": [
                        498,
                        "[CreateViewFieldGroupInput!]!"
                    ]
                }
            ],
            "deleteViewFieldGroup": [
                65,
                {
                    "input": [
                        499,
                        "DeleteViewFieldGroupInput!"
                    ]
                }
            ],
            "destroyViewFieldGroup": [
                65,
                {
                    "input": [
                        500,
                        "DestroyViewFieldGroupInput!"
                    ]
                }
            ],
            "upsertFieldsWidget": [
                66,
                {
                    "input": [
                        501,
                        "UpsertFieldsWidgetInput!"
                    ]
                }
            ],
            "createOneObject": [
                52,
                {
                    "input": [
                        504,
                        "CreateOneObjectInput!"
                    ]
                }
            ],
            "deleteOneObject": [
                52,
                {
                    "input": [
                        506,
                        "DeleteOneObjectInput!"
                    ]
                }
            ],
            "updateOneObject": [
                52,
                {
                    "input": [
                        507,
                        "UpdateOneObjectInput!"
                    ]
                }
            ],
            "createApiKey": [
                2,
                {
                    "input": [
                        509,
                        "CreateApiKeyInput!"
                    ]
                }
            ],
            "updateApiKey": [
                2,
                {
                    "input": [
                        510,
                        "UpdateApiKeyInput!"
                    ]
                }
            ],
            "revokeApiKey": [
                2,
                {
                    "input": [
                        511,
                        "RevokeApiKeyInput!"
                    ]
                }
            ],
            "assignRoleToApiKey": [
                6,
                {
                    "apiKeyId": [
                        3,
                        "UUID!"
                    ],
                    "roleId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "initiateOTPProvisioning": [
                270,
                {
                    "loginToken": [
                        1,
                        "String!"
                    ],
                    "origin": [
                        1,
                        "String!"
                    ]
                }
            ],
            "initiateOTPProvisioningForAuthenticatedUser": [
                270
            ],
            "deleteTwoFactorAuthenticationMethod": [
                269,
                {
                    "twoFactorAuthenticationMethodId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "verifyTwoFactorAuthenticationMethodForAuthenticatedUser": [
                271,
                {
                    "otp": [
                        1,
                        "String!"
                    ]
                }
            ],
            "deleteUser": [
                76
            ],
            "deleteUserFromWorkspace": [
                17,
                {
                    "workspaceMemberIdToDelete": [
                        1,
                        "String!"
                    ]
                }
            ],
            "updateWorkspaceMemberSettings": [
                6,
                {
                    "input": [
                        512,
                        "UpdateWorkspaceMemberSettingsInput!"
                    ]
                }
            ],
            "updateUserEmail": [
                6,
                {
                    "newEmail": [
                        1,
                        "String!"
                    ],
                    "verifyEmailRedirectPath": [
                        1
                    ]
                }
            ],
            "resendEmailVerificationToken": [
                239,
                {
                    "email": [
                        1,
                        "String!"
                    ],
                    "origin": [
                        1,
                        "String!"
                    ]
                }
            ],
            "skipSyncEmailOnboardingStep": [
                222
            ],
            "skipBookOnboardingStep": [
                222
            ],
            "triggerInstallAppsOnboardingStep": [
                222,
                {
                    "universalIdentifiers": [
                        1,
                        "[String!]!"
                    ]
                }
            ],
            "deleteWorkspaceInvitation": [
                1,
                {
                    "appTokenId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "resendWorkspaceInvitation": [
                224,
                {
                    "appTokenId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "sendInvitations": [
                224,
                {
                    "emails": [
                        1,
                        "[String!]!"
                    ],
                    "roleId": [
                        3
                    ]
                }
            ],
            "createApprovedAccessDomain": [
                221,
                {
                    "input": [
                        513,
                        "CreateApprovedAccessDomainInput!"
                    ]
                }
            ],
            "deleteApprovedAccessDomain": [
                6,
                {
                    "input": [
                        514,
                        "DeleteApprovedAccessDomainInput!"
                    ]
                }
            ],
            "validateApprovedAccessDomain": [
                221,
                {
                    "input": [
                        515,
                        "ValidateApprovedAccessDomainInput!"
                    ]
                }
            ],
            "updateConnectedAccountSendingPolicy": [
                165,
                {
                    "input": [
                        516,
                        "UpdateConnectedAccountSendingPolicyInput!"
                    ]
                }
            ],
            "deleteConnectedAccount": [
                165,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "activateWorkspace": [
                72,
                {
                    "data": [
                        517,
                        "ActivateWorkspaceInput!"
                    ]
                }
            ],
            "updateWorkspace": [
                72,
                {
                    "data": [
                        518,
                        "UpdateWorkspaceInput!"
                    ]
                }
            ],
            "deleteCurrentWorkspace": [
                72
            ],
            "checkCustomDomainValidRecords": [
                260
            ],
            "createViewFilterGroup": [
                58,
                {
                    "input": [
                        519,
                        "CreateViewFilterGroupInput!"
                    ]
                }
            ],
            "updateViewFilterGroup": [
                58,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        520,
                        "UpdateViewFilterGroupInput!"
                    ]
                }
            ],
            "deleteViewFilterGroup": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "destroyViewFilterGroup": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "attachCampaignCreatorLists": [
                216,
                {
                    "input": [
                        521,
                        "AttachCampaignCreatorListsInput!"
                    ]
                }
            ],
            "addDirectCampaignCreators": [
                216,
                {
                    "input": [
                        522,
                        "AddDirectCampaignCreatorsInput!"
                    ]
                }
            ],
            "approveCampaignCreatorListAdditions": [
                6,
                {
                    "input": [
                        523,
                        "ApproveCampaignCreatorListAdditionsInput!"
                    ]
                }
            ],
            "detachCampaignCreatorList": [
                216,
                {
                    "input": [
                        524,
                        "DetachCampaignCreatorListInput!"
                    ]
                }
            ],
            "addCreatorListMemberIntent": [
                219,
                {
                    "input": [
                        413,
                        "CreatorListMembershipIntentInput!"
                    ]
                }
            ],
            "addCreatorListMembersIntent": [
                219,
                {
                    "input": [
                        525,
                        "CreatorListMembersIntentInput!"
                    ]
                }
            ],
            "removeCreatorListMemberIntent": [
                6,
                {
                    "input": [
                        526,
                        "RemoveCreatorListMemberIntentInput!"
                    ]
                }
            ],
            "replaceCampaignEmailPool": [
                209,
                {
                    "input": [
                        527,
                        "ReplaceCampaignEmailPoolInput!"
                    ]
                }
            ],
            "linkCampaignEmailAccount": [
                212,
                {
                    "input": [
                        528,
                        "LinkCampaignEmailAccountInput!"
                    ]
                }
            ],
            "setDefaultCampaignEmailAccount": [
                212,
                {
                    "input": [
                        529,
                        "CampaignEmailAccountLinkInput!"
                    ]
                }
            ],
            "removeCampaignEmailAccount": [
                212,
                {
                    "input": [
                        529,
                        "CampaignEmailAccountLinkInput!"
                    ]
                }
            ],
            "sendEmailViaEmailingDomain": [
                176,
                {
                    "input": [
                        530,
                        "SendEmailViaDomainInput!"
                    ]
                }
            ],
            "sendMessageCampaign": [
                178,
                {
                    "input": [
                        531,
                        "SendMessageCampaignInput!"
                    ]
                }
            ],
            "createUnsubscribeTopic": [
                179,
                {
                    "input": [
                        532,
                        "CreateUnsubscribeTopicInput!"
                    ]
                }
            ],
            "updateUnsubscribeTopic": [
                179,
                {
                    "input": [
                        533,
                        "UpdateUnsubscribeTopicInput!"
                    ]
                }
            ],
            "deleteUnsubscribeTopic": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "updateMessageChannel": [
                166,
                {
                    "input": [
                        534,
                        "UpdateMessageChannelInput!"
                    ]
                }
            ],
            "createEmailGroupChannel": [
                174,
                {
                    "input": [
                        536,
                        "CreateEmailGroupChannelInput!"
                    ]
                }
            ],
            "deleteEmailGroupChannel": [
                166,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createEmailingDomain": [
                160,
                {
                    "input": [
                        537,
                        "CreateEmailingDomainInput!"
                    ]
                }
            ],
            "deleteEmailingDomain": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "verifyEmailingDomain": [
                160,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createCommandMenuItem": [
                35,
                {
                    "input": [
                        538,
                        "CreateCommandMenuItemInput!"
                    ]
                }
            ],
            "updateCommandMenuItem": [
                35,
                {
                    "input": [
                        539,
                        "UpdateCommandMenuItemInput!"
                    ]
                }
            ],
            "resetCommandMenuItem": [
                35,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "deleteCommandMenuItem": [
                35,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createFrontComponent": [
                34,
                {
                    "input": [
                        540,
                        "CreateFrontComponentInput!"
                    ]
                }
            ],
            "updateFrontComponent": [
                34,
                {
                    "input": [
                        541,
                        "UpdateFrontComponentInput!"
                    ]
                }
            ],
            "deleteFrontComponent": [
                34,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "deleteOneLogicFunction": [
                41,
                {
                    "input": [
                        417,
                        "LogicFunctionIdInput!"
                    ]
                }
            ],
            "createOneLogicFunction": [
                41,
                {
                    "input": [
                        543,
                        "CreateLogicFunctionFromSourceInput!"
                    ]
                }
            ],
            "executeOneLogicFunction": [
                193,
                {
                    "input": [
                        544,
                        "ExecuteOneLogicFunctionInput!"
                    ]
                }
            ],
            "updateOneLogicFunction": [
                6,
                {
                    "input": [
                        545,
                        "UpdateLogicFunctionFromSourceInput!"
                    ]
                }
            ],
            "createPageLayoutTab": [
                120,
                {
                    "input": [
                        547,
                        "CreatePageLayoutTabInput!"
                    ]
                }
            ],
            "updatePageLayoutTab": [
                120,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        548,
                        "UpdatePageLayoutTabInput!"
                    ]
                }
            ],
            "destroyPageLayoutTab": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createPageLayout": [
                121,
                {
                    "input": [
                        549,
                        "CreatePageLayoutInput!"
                    ]
                }
            ],
            "updatePageLayout": [
                121,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        550,
                        "UpdatePageLayoutInput!"
                    ]
                }
            ],
            "destroyPageLayout": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "updatePageLayoutWithTabsAndWidgets": [
                121,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        551,
                        "UpdatePageLayoutWithTabsInput!"
                    ]
                }
            ],
            "resetPageLayoutToDefault": [
                121,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "resetPageLayoutWidgetToDefault": [
                82,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "resetPageLayoutTabToDefault": [
                120,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "installMarketplaceApp": [
                6,
                {
                    "universalIdentifier": [
                        1,
                        "String!"
                    ],
                    "version": [
                        1
                    ]
                }
            ],
            "installApplication": [
                55,
                {
                    "universalIdentifier": [
                        1,
                        "String!"
                    ],
                    "version": [
                        1
                    ]
                }
            ],
            "uninstallApplication": [
                6,
                {
                    "universalIdentifier": [
                        1,
                        "String!"
                    ]
                }
            ],
            "syncMarketplaceCatalog": [
                6
            ],
            "createOneAgent": [
                25,
                {
                    "input": [
                        555,
                        "CreateAgentInput!"
                    ]
                }
            ],
            "updateOneAgent": [
                25,
                {
                    "input": [
                        556,
                        "UpdateAgentInput!"
                    ]
                }
            ],
            "deleteOneAgent": [
                25,
                {
                    "input": [
                        418,
                        "AgentIdInput!"
                    ]
                }
            ],
            "updateWorkspaceMemberRole": [
                20,
                {
                    "workspaceMemberId": [
                        3,
                        "UUID!"
                    ],
                    "roleId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createOneRole": [
                29,
                {
                    "createRoleInput": [
                        557,
                        "CreateRoleInput!"
                    ]
                }
            ],
            "updateOneRole": [
                29,
                {
                    "updateRoleInput": [
                        558,
                        "UpdateRoleInput!"
                    ]
                }
            ],
            "deleteOneRole": [
                1,
                {
                    "roleId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "upsertObjectPermissions": [
                16,
                {
                    "upsertObjectPermissionsInput": [
                        560,
                        "UpsertObjectPermissionsInput!"
                    ]
                }
            ],
            "upsertPermissionFlags": [
                27,
                {
                    "upsertPermissionFlagsInput": [
                        562,
                        "UpsertPermissionFlagsInput!"
                    ]
                }
            ],
            "upsertFieldPermissions": [
                26,
                {
                    "upsertFieldPermissionsInput": [
                        563,
                        "UpsertFieldPermissionsInput!"
                    ]
                }
            ],
            "upsertRowLevelPermissionPredicates": [
                268,
                {
                    "input": [
                        565,
                        "UpsertRowLevelPermissionPredicatesInput!"
                    ]
                }
            ],
            "assignRoleToAgent": [
                6,
                {
                    "agentId": [
                        3,
                        "UUID!"
                    ],
                    "roleId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "removeRoleFromAgent": [
                6,
                {
                    "agentId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createOIDCIdentityProvider": [
                246,
                {
                    "input": [
                        568,
                        "SetupOIDCSsoInput!"
                    ]
                }
            ],
            "createSAMLIdentityProvider": [
                246,
                {
                    "input": [
                        569,
                        "SetupSAMLSsoInput!"
                    ]
                }
            ],
            "deleteSSOIdentityProvider": [
                240,
                {
                    "input": [
                        570,
                        "DeleteSsoInput!"
                    ]
                }
            ],
            "editSSOIdentityProvider": [
                241,
                {
                    "input": [
                        571,
                        "EditSsoInput!"
                    ]
                }
            ],
            "createPageLayoutWidget": [
                82,
                {
                    "input": [
                        572,
                        "CreatePageLayoutWidgetInput!"
                    ]
                }
            ],
            "updatePageLayoutWidget": [
                82,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        573,
                        "UpdatePageLayoutWidgetInput!"
                    ]
                }
            ],
            "destroyPageLayoutWidget": [
                6,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createWebhook": [
                343,
                {
                    "input": [
                        574,
                        "CreateWebhookInput!"
                    ]
                }
            ],
            "updateWebhook": [
                343,
                {
                    "input": [
                        575,
                        "UpdateWebhookInput!"
                    ]
                }
            ],
            "deleteWebhook": [
                343,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "runAgent": [
                342,
                {
                    "input": [
                        577,
                        "RunAgentInput!"
                    ]
                }
            ],
            "updateMessageFolder": [
                394,
                {
                    "input": [
                        578,
                        "UpdateMessageFolderInput!"
                    ]
                }
            ],
            "updateMessageFolders": [
                394,
                {
                    "input": [
                        580,
                        "UpdateMessageFoldersInput!"
                    ]
                }
            ],
            "updateCalendarChannel": [
                389,
                {
                    "input": [
                        581,
                        "UpdateCalendarChannelInput!"
                    ]
                }
            ],
            "createChatThread": [
                379
            ],
            "sendChatMessage": [
                384,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ],
                    "text": [
                        1,
                        "String!"
                    ],
                    "messageId": [
                        3,
                        "UUID!"
                    ],
                    "browsingContext": [
                        7
                    ],
                    "modelId": [
                        1
                    ],
                    "fileAttachments": [
                        583,
                        "[FileAttachmentInput!]"
                    ]
                }
            ],
            "retryChatMessage": [
                384,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ],
                    "browsingContext": [
                        7
                    ],
                    "modelId": [
                        1
                    ]
                }
            ],
            "answerAgentChatQuestion": [
                384,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ],
                    "messageId": [
                        3,
                        "UUID!"
                    ],
                    "answers": [
                        584,
                        "[AgentChatQuestionAnswerInput!]!"
                    ],
                    "modelId": [
                        1
                    ]
                }
            ],
            "resolveAgentChatApproval": [
                384,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ],
                    "messageId": [
                        3,
                        "UUID!"
                    ],
                    "decision": [
                        585,
                        "AgentChatApprovalDecisionInput!"
                    ],
                    "modelId": [
                        1
                    ]
                }
            ],
            "stopAgentChatStream": [
                6,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "renameChatThread": [
                379,
                {
                    "id": [
                        3,
                        "UUID!"
                    ],
                    "title": [
                        1,
                        "String!"
                    ]
                }
            ],
            "archiveChatThread": [
                379,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "unarchiveChatThread": [
                379,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "deleteChatThread": [
                6,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "deleteQueuedChatMessage": [
                6,
                {
                    "messageId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createSkill": [
                377,
                {
                    "input": [
                        586,
                        "CreateSkillInput!"
                    ]
                }
            ],
            "updateSkill": [
                377,
                {
                    "input": [
                        587,
                        "UpdateSkillInput!"
                    ]
                }
            ],
            "deleteSkill": [
                377,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "activateSkill": [
                377,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "deactivateSkill": [
                377,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "evaluateAgentTurn": [
                386,
                {
                    "turnId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "runEvaluationInput": [
                387,
                {
                    "agentId": [
                        3,
                        "UUID!"
                    ],
                    "input": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createObjectEvent": [
                373,
                {
                    "event": [
                        1,
                        "String!"
                    ],
                    "recordId": [
                        3,
                        "UUID!"
                    ],
                    "objectMetadataId": [
                        3,
                        "UUID!"
                    ],
                    "properties": [
                        7
                    ]
                }
            ],
            "trackAnalytics": [
                373,
                {
                    "type": [
                        588,
                        "AnalyticsType!"
                    ],
                    "name": [
                        1
                    ],
                    "event": [
                        1
                    ],
                    "properties": [
                        7
                    ]
                }
            ],
            "duplicateDashboard": [
                371,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "impersonate": [
                330,
                {
                    "userId": [
                        3,
                        "UUID!"
                    ],
                    "workspaceId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "excludeCampaignCreator": [
                354,
                {
                    "input": [
                        589,
                        "ExcludeCampaignCreatorInput!"
                    ]
                }
            ],
            "startCampaignExecution": [
                356,
                {
                    "input": [
                        590,
                        "StartCampaignExecutionInput!"
                    ]
                }
            ],
            "updateCampaignSendingWindow": [
                355,
                {
                    "input": [
                        591,
                        "UpdateCampaignSendingWindowInput!"
                    ]
                }
            ],
            "stopCampaignExecution": [
                356,
                {
                    "input": [
                        592,
                        "StopCampaignExecutionInput!"
                    ]
                }
            ],
            "sendEmail": [
                372,
                {
                    "input": [
                        593,
                        "SendEmailInput!"
                    ]
                }
            ],
            "startChannelSync": [
                363,
                {
                    "connectedAccountId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "updateLabPublicFeatureFlag": [
                261,
                {
                    "input": [
                        595,
                        "UpdateLabPublicFeatureFlagInput!"
                    ]
                }
            ],
            "createPublicDomain": [
                337,
                {
                    "domain": [
                        1,
                        "String!"
                    ],
                    "applicationId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "deletePublicDomain": [
                6,
                {
                    "domain": [
                        1,
                        "String!"
                    ]
                }
            ],
            "checkPublicDomainValidRecords": [
                260,
                {
                    "domain": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createOneAppToken": [
                75,
                {
                    "input": [
                        596,
                        "CreateOneAppTokenInput!"
                    ]
                }
            ],
            "createDevelopmentApplication": [
                334,
                {
                    "universalIdentifier": [
                        1,
                        "String!"
                    ],
                    "name": [
                        1,
                        "String!"
                    ]
                }
            ],
            "syncApplication": [
                335,
                {
                    "manifest": [
                        7,
                        "JSON!"
                    ],
                    "dryRun": [
                        6
                    ]
                }
            ],
            "uploadApplicationFile": [
                336,
                {
                    "file": [
                        444,
                        "Upload!"
                    ],
                    "applicationUniversalIdentifier": [
                        1,
                        "String!"
                    ],
                    "fileFolder": [
                        443,
                        "FileFolder!"
                    ],
                    "filePath": [
                        1,
                        "String!"
                    ]
                }
            ],
            "upgradeApplication": [
                6,
                {
                    "appRegistrationId": [
                        1,
                        "String!"
                    ],
                    "targetVersion": [
                        1,
                        "String!"
                    ]
                }
            ],
            "generateApplicationToken": [
                33,
                {
                    "applicationId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "renewApplicationToken": [
                33,
                {
                    "applicationRefreshToken": [
                        1,
                        "String!"
                    ]
                }
            ],
            "__typename": [
                1
            ]
        },
        "ConnectWorkspaceMailboxInput": {
            "accountType": [
                1
            ],
            "connectionParameters": [
                435
            ],
            "handle": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceMailboxConnectionParametersInput": {
            "IMAP": [
                436
            ],
            "SMTP": [
                436
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceMailboxProtocolConnectionInput": {
            "host": [
                1
            ],
            "port": [
                12
            ],
            "username": [
                1
            ],
            "password": [
                1
            ],
            "connectionSecurity": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ReplaceWorkspaceMailboxCredentialsInput": {
            "connectedAccountId": [
                1
            ],
            "connectionParameters": [
                435
            ],
            "__typename": [
                1
            ]
        },
        "AddQuerySubscriptionInput": {
            "eventStreamId": [
                1
            ],
            "queryId": [
                1
            ],
            "operationSignature": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "RemoveQueryFromEventStreamInput": {
            "eventStreamId": [
                1
            ],
            "queryId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateNavigationMenuItemInput": {
            "id": [
                3
            ],
            "userWorkspaceId": [
                3
            ],
            "targetRecordId": [
                3
            ],
            "targetObjectMetadataId": [
                3
            ],
            "viewId": [
                3
            ],
            "type": [
                185
            ],
            "name": [
                1
            ],
            "link": [
                1
            ],
            "icon": [
                1
            ],
            "color": [
                1
            ],
            "folderId": [
                3
            ],
            "pageLayoutId": [
                3
            ],
            "position": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "UpdateOneNavigationMenuItemInput": {
            "id": [
                3
            ],
            "update": [
                442
            ],
            "__typename": [
                1
            ]
        },
        "UpdateNavigationMenuItemInput": {
            "folderId": [
                3
            ],
            "position": [
                12
            ],
            "name": [
                1
            ],
            "link": [
                1
            ],
            "icon": [
                1
            ],
            "color": [
                1
            ],
            "pageLayoutId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "FileFolder": {},
        "Upload": {},
        "ManagedEmailCompletePaymentMethodInput": {
            "setupIntentId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailPurchaseInput": {
            "idempotencyKey": [
                1
            ],
            "quoteId": [
                1
            ],
            "quoteVersion": [
                1
            ],
            "quoteFingerprint": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailCampaignCapInput": {
            "dailyCap": [
                21
            ],
            "idempotencyKey": [
                1
            ],
            "mailboxId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailMailboxActionInput": {
            "idempotencyKey": [
                1
            ],
            "mailboxId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailDomainActionInput": {
            "domainId": [
                1
            ],
            "idempotencyKey": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "EmailAccountConnectionParameters": {
            "IMAP": [
                451
            ],
            "SMTP": [
                451
            ],
            "CALDAV": [
                451
            ],
            "__typename": [
                1
            ]
        },
        "ConnectionParametersInput": {
            "host": [
                1
            ],
            "port": [
                12
            ],
            "username": [
                1
            ],
            "password": [
                1
            ],
            "connectionSecurity": [
                163
            ],
            "__typename": [
                1
            ]
        },
        "GetAuthorizationUrlForSSOInput": {
            "identityProviderId": [
                3
            ],
            "workspaceInviteHash": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "SignUpInNewWorkspaceInput": {
            "displayName": [
                1
            ],
            "subdomain": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateApplicationRegistrationInput": {
            "name": [
                1
            ],
            "universalIdentifier": [
                1
            ],
            "oAuthRedirectUris": [
                1
            ],
            "oAuthScopes": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "UpdateApplicationRegistrationInput": {
            "id": [
                1
            ],
            "update": [
                456
            ],
            "__typename": [
                1
            ]
        },
        "UpdateApplicationRegistrationPayload": {
            "name": [
                1
            ],
            "oAuthRedirectUris": [
                1
            ],
            "oAuthScopes": [
                1
            ],
            "isListed": [
                6
            ],
            "isPreInstalled": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "CreateApplicationRegistrationVariableInput": {
            "applicationRegistrationId": [
                1
            ],
            "key": [
                1
            ],
            "value": [
                1
            ],
            "description": [
                1
            ],
            "isSecret": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "UpdateApplicationRegistrationVariableInput": {
            "id": [
                1
            ],
            "update": [
                459
            ],
            "__typename": [
                1
            ]
        },
        "UpdateApplicationRegistrationVariablePayload": {
            "value": [
                1
            ],
            "resetValue": [
                6
            ],
            "description": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateOneFieldMetadataInput": {
            "field": [
                461
            ],
            "__typename": [
                1
            ]
        },
        "CreateFieldInput": {
            "type": [
                44
            ],
            "name": [
                1
            ],
            "label": [
                1
            ],
            "description": [
                1
            ],
            "icon": [
                1
            ],
            "isActive": [
                6
            ],
            "isSystem": [
                6
            ],
            "isUIEditable": [
                6
            ],
            "isUIReadOnly": [
                6
            ],
            "isNullable": [
                6
            ],
            "isUnique": [
                6
            ],
            "defaultValue": [
                7
            ],
            "options": [
                7
            ],
            "settings": [
                7
            ],
            "objectMetadataId": [
                3
            ],
            "isLabelSyncedWithName": [
                6
            ],
            "isRemoteCreation": [
                6
            ],
            "relationCreationPayload": [
                7
            ],
            "morphRelationsCreationPayload": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "UpdateOneFieldMetadataInput": {
            "id": [
                3
            ],
            "update": [
                463
            ],
            "__typename": [
                1
            ]
        },
        "UpdateFieldInput": {
            "universalIdentifier": [
                1
            ],
            "name": [
                1
            ],
            "label": [
                1
            ],
            "description": [
                1
            ],
            "icon": [
                1
            ],
            "isActive": [
                6
            ],
            "isSystem": [
                6
            ],
            "isUIEditable": [
                6
            ],
            "isUIReadOnly": [
                6
            ],
            "isNullable": [
                6
            ],
            "isUnique": [
                6
            ],
            "defaultValue": [
                7
            ],
            "options": [
                7
            ],
            "settings": [
                7
            ],
            "objectMetadataId": [
                3
            ],
            "isLabelSyncedWithName": [
                6
            ],
            "morphRelationsUpdatePayload": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "DeleteOneFieldInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CreateOneIndexInput": {
            "index": [
                466
            ],
            "__typename": [
                1
            ]
        },
        "CreateIndexInput": {
            "objectMetadataId": [
                3
            ],
            "fields": [
                467
            ],
            "indexType": [
                46
            ],
            "__typename": [
                1
            ]
        },
        "CreateIndexFieldInput": {
            "fieldMetadataId": [
                3
            ],
            "subFieldName": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "DeleteOneIndexInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CreateViewGroupInput": {
            "id": [
                3
            ],
            "isVisible": [
                6
            ],
            "fieldValue": [
                1
            ],
            "position": [
                12
            ],
            "viewId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewGroupInput": {
            "id": [
                3
            ],
            "update": [
                471
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewGroupInputUpdates": {
            "fieldMetadataId": [
                3
            ],
            "isVisible": [
                6
            ],
            "fieldValue": [
                1
            ],
            "position": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "DeleteViewGroupInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "DestroyViewGroupInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CreateViewFilterInput": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "operand": [
                61
            ],
            "value": [
                7
            ],
            "viewFilterGroupId": [
                3
            ],
            "positionInViewFilterGroup": [
                12
            ],
            "subFieldName": [
                1
            ],
            "relationTargetFieldMetadataId": [
                3
            ],
            "viewId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewFilterInput": {
            "id": [
                3
            ],
            "update": [
                476
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewFilterInputUpdates": {
            "fieldMetadataId": [
                3
            ],
            "operand": [
                61
            ],
            "value": [
                7
            ],
            "viewFilterGroupId": [
                3
            ],
            "positionInViewFilterGroup": [
                12
            ],
            "subFieldName": [
                1
            ],
            "relationTargetFieldMetadataId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "DeleteViewFilterInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "DestroyViewFilterInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewFieldInput": {
            "id": [
                3
            ],
            "update": [
                480
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewFieldInputUpdates": {
            "isVisible": [
                6
            ],
            "size": [
                12
            ],
            "position": [
                12
            ],
            "aggregateOperation": [
                57
            ],
            "viewFieldGroupId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CreateViewFieldInput": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "viewId": [
                3
            ],
            "isVisible": [
                6
            ],
            "size": [
                12
            ],
            "position": [
                12
            ],
            "aggregateOperation": [
                57
            ],
            "viewFieldGroupId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "DeleteViewFieldInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "DestroyViewFieldInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CreateViewInput": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "objectMetadataId": [
                3
            ],
            "type": [
                67
            ],
            "key": [
                68
            ],
            "icon": [
                1
            ],
            "position": [
                12
            ],
            "isCompact": [
                6
            ],
            "shouldHideEmptyGroups": [
                6
            ],
            "kanbanColumnWidth": [
                21
            ],
            "openRecordIn": [
                69
            ],
            "kanbanAggregateOperation": [
                57
            ],
            "kanbanAggregateOperationFieldMetadataId": [
                3
            ],
            "anyFieldFilterValue": [
                1
            ],
            "calendarLayout": [
                70
            ],
            "calendarFieldMetadataId": [
                3
            ],
            "mainGroupByFieldMetadataId": [
                3
            ],
            "visibility": [
                71
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewInput": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "type": [
                67
            ],
            "icon": [
                1
            ],
            "position": [
                12
            ],
            "isCompact": [
                6
            ],
            "openRecordIn": [
                69
            ],
            "kanbanAggregateOperation": [
                57
            ],
            "kanbanAggregateOperationFieldMetadataId": [
                3
            ],
            "anyFieldFilterValue": [
                1
            ],
            "calendarLayout": [
                70
            ],
            "calendarFieldMetadataId": [
                3
            ],
            "visibility": [
                71
            ],
            "mainGroupByFieldMetadataId": [
                3
            ],
            "shouldHideEmptyGroups": [
                6
            ],
            "kanbanColumnWidth": [
                21
            ],
            "__typename": [
                1
            ]
        },
        "UpsertViewWidgetInput": {
            "widgetId": [
                3
            ],
            "viewFields": [
                487
            ],
            "viewFilters": [
                488
            ],
            "viewFilterGroups": [
                489
            ],
            "viewSorts": [
                490
            ],
            "__typename": [
                1
            ]
        },
        "UpsertViewWidgetViewFieldInput": {
            "viewFieldId": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "isVisible": [
                6
            ],
            "position": [
                12
            ],
            "size": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "UpsertViewWidgetViewFilterInput": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "operand": [
                61
            ],
            "value": [
                7
            ],
            "viewFilterGroupId": [
                3
            ],
            "positionInViewFilterGroup": [
                12
            ],
            "subFieldName": [
                1
            ],
            "relationTargetFieldMetadataId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpsertViewWidgetViewFilterGroupInput": {
            "id": [
                3
            ],
            "parentViewFilterGroupId": [
                3
            ],
            "logicalOperator": [
                59
            ],
            "positionInViewFilterGroup": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "UpsertViewWidgetViewSortInput": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "direction": [
                64
            ],
            "__typename": [
                1
            ]
        },
        "CreateViewSortInput": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "direction": [
                64
            ],
            "subFieldName": [
                1
            ],
            "viewId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewSortInput": {
            "id": [
                3
            ],
            "update": [
                493
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewSortInputUpdates": {
            "direction": [
                64
            ],
            "subFieldName": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "DeleteViewSortInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "DestroyViewSortInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewFieldGroupInput": {
            "id": [
                3
            ],
            "update": [
                497
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewFieldGroupInputUpdates": {
            "name": [
                1
            ],
            "position": [
                12
            ],
            "isVisible": [
                6
            ],
            "deletedAt": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateViewFieldGroupInput": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "viewId": [
                3
            ],
            "position": [
                12
            ],
            "isVisible": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "DeleteViewFieldGroupInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "DestroyViewFieldGroupInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpsertFieldsWidgetInput": {
            "widgetId": [
                3
            ],
            "groups": [
                502
            ],
            "fields": [
                503
            ],
            "__typename": [
                1
            ]
        },
        "UpsertFieldsWidgetGroupInput": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "position": [
                12
            ],
            "isVisible": [
                6
            ],
            "fields": [
                503
            ],
            "__typename": [
                1
            ]
        },
        "UpsertFieldsWidgetFieldInput": {
            "viewFieldId": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "isVisible": [
                6
            ],
            "position": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "CreateOneObjectInput": {
            "object": [
                505
            ],
            "__typename": [
                1
            ]
        },
        "CreateObjectInput": {
            "nameSingular": [
                1
            ],
            "namePlural": [
                1
            ],
            "labelSingular": [
                1
            ],
            "labelPlural": [
                1
            ],
            "description": [
                1
            ],
            "icon": [
                1
            ],
            "shortcut": [
                1
            ],
            "color": [
                1
            ],
            "skipNameField": [
                6
            ],
            "isRemote": [
                6
            ],
            "primaryKeyColumnType": [
                1
            ],
            "primaryKeyFieldMetadataSettings": [
                7
            ],
            "isLabelSyncedWithName": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "DeleteOneObjectInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateOneObjectInput": {
            "update": [
                508
            ],
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateObjectPayload": {
            "labelSingular": [
                1
            ],
            "labelPlural": [
                1
            ],
            "nameSingular": [
                1
            ],
            "namePlural": [
                1
            ],
            "description": [
                1
            ],
            "icon": [
                1
            ],
            "shortcut": [
                1
            ],
            "color": [
                1
            ],
            "isActive": [
                6
            ],
            "labelIdentifierFieldMetadataId": [
                3
            ],
            "imageIdentifierFieldMetadataId": [
                3
            ],
            "isLabelSyncedWithName": [
                6
            ],
            "isSearchable": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "CreateApiKeyInput": {
            "name": [
                1
            ],
            "expiresAt": [
                1
            ],
            "revokedAt": [
                1
            ],
            "roleId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateApiKeyInput": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "expiresAt": [
                1
            ],
            "revokedAt": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "RevokeApiKeyInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateWorkspaceMemberSettingsInput": {
            "workspaceMemberId": [
                3
            ],
            "update": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "CreateApprovedAccessDomainInput": {
            "domain": [
                1
            ],
            "email": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "DeleteApprovedAccessDomainInput": {
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "ValidateApprovedAccessDomainInput": {
            "validationToken": [
                1
            ],
            "approvedAccessDomainId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateConnectedAccountSendingPolicyInput": {
            "connectedAccountId": [
                3
            ],
            "dailySendLimit": [
                21
            ],
            "minimumSendIntervalMs": [
                21
            ],
            "expectedRevision": [
                21
            ],
            "idempotencyKey": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "ActivateWorkspaceInput": {
            "displayName": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "UpdateWorkspaceInput": {
            "subdomain": [
                1
            ],
            "customDomain": [
                1
            ],
            "displayName": [
                1
            ],
            "logo": [
                1
            ],
            "inviteHash": [
                1
            ],
            "isPublicInviteLinkEnabled": [
                6
            ],
            "workspaceDiscoverability": [
                73
            ],
            "allowImpersonation": [
                6
            ],
            "isGoogleAuthEnabled": [
                6
            ],
            "isMicrosoftAuthEnabled": [
                6
            ],
            "isPasswordAuthEnabled": [
                6
            ],
            "isGoogleAuthBypassEnabled": [
                6
            ],
            "isMicrosoftAuthBypassEnabled": [
                6
            ],
            "isPasswordAuthBypassEnabled": [
                6
            ],
            "defaultRoleId": [
                3
            ],
            "isTwoFactorAuthenticationEnforced": [
                6
            ],
            "trashRetentionDays": [
                12
            ],
            "eventLogRetentionDays": [
                12
            ],
            "fastModel": [
                1
            ],
            "smartModel": [
                1
            ],
            "aiAdditionalInstructions": [
                1
            ],
            "editableProfileFields": [
                1
            ],
            "enabledAiModelIds": [
                1
            ],
            "useRecommendedModels": [
                6
            ],
            "isInternalMessagesImportEnabled": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "CreateViewFilterGroupInput": {
            "id": [
                3
            ],
            "parentViewFilterGroupId": [
                3
            ],
            "logicalOperator": [
                59
            ],
            "positionInViewFilterGroup": [
                12
            ],
            "viewId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewFilterGroupInput": {
            "id": [
                3
            ],
            "parentViewFilterGroupId": [
                3
            ],
            "logicalOperator": [
                59
            ],
            "positionInViewFilterGroup": [
                12
            ],
            "viewId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "AttachCampaignCreatorListsInput": {
            "campaignId": [
                3
            ],
            "creatorListIds": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "AddDirectCampaignCreatorsInput": {
            "campaignId": [
                3
            ],
            "creatorIds": [
                3
            ],
            "assignedManagedMailboxId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "ApproveCampaignCreatorListAdditionsInput": {
            "campaignId": [
                3
            ],
            "creatorListId": [
                3
            ],
            "creatorIds": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "DetachCampaignCreatorListInput": {
            "campaignId": [
                3
            ],
            "creatorListId": [
                3
            ],
            "confirmedCreatorIds": [
                3
            ],
            "confirmationToken": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreatorListMembersIntentInput": {
            "creatorListId": [
                3
            ],
            "creatorIds": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "RemoveCreatorListMemberIntentInput": {
            "creatorListId": [
                3
            ],
            "creatorId": [
                3
            ],
            "confirmedCampaignIds": [
                3
            ],
            "confirmationToken": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ReplaceCampaignEmailPoolInput": {
            "campaignId": [
                3
            ],
            "connectedAccountIds": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "LinkCampaignEmailAccountInput": {
            "campaignId": [
                3
            ],
            "connectedAccountId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CampaignEmailAccountLinkInput": {
            "campaignId": [
                3
            ],
            "campaignAccountId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "SendEmailViaDomainInput": {
            "emailingDomainId": [
                1
            ],
            "to": [
                1
            ],
            "cc": [
                1
            ],
            "bcc": [
                1
            ],
            "subject": [
                1
            ],
            "text": [
                1
            ],
            "html": [
                1
            ],
            "from": [
                1
            ],
            "replyTo": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "SendMessageCampaignInput": {
            "listId": [
                1
            ],
            "unsubscribeTopicId": [
                1
            ],
            "subject": [
                1
            ],
            "body": [
                1
            ],
            "fromAddress": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateUnsubscribeTopicInput": {
            "name": [
                1
            ],
            "description": [
                1
            ],
            "visibility": [
                180
            ],
            "__typename": [
                1
            ]
        },
        "UpdateUnsubscribeTopicInput": {
            "id": [
                1
            ],
            "name": [
                1
            ],
            "description": [
                1
            ],
            "visibility": [
                180
            ],
            "__typename": [
                1
            ]
        },
        "UpdateMessageChannelInput": {
            "id": [
                3
            ],
            "update": [
                535
            ],
            "__typename": [
                1
            ]
        },
        "UpdateMessageChannelInputUpdates": {
            "visibility": [
                167
            ],
            "isContactAutoCreationEnabled": [
                6
            ],
            "contactAutoCreationPolicy": [
                169
            ],
            "messageFolderImportPolicy": [
                170
            ],
            "isSyncEnabled": [
                6
            ],
            "excludeNonProfessionalEmails": [
                6
            ],
            "excludeGroupEmails": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "CreateEmailGroupChannelInput": {
            "handle": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateEmailingDomainInput": {
            "domain": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateCommandMenuItemInput": {
            "workflowVersionId": [
                3
            ],
            "frontComponentId": [
                3
            ],
            "engineComponentKey": [
                36
            ],
            "label": [
                1
            ],
            "icon": [
                1
            ],
            "shortLabel": [
                1
            ],
            "position": [
                12
            ],
            "isPinned": [
                6
            ],
            "availabilityType": [
                37
            ],
            "hotKeys": [
                1
            ],
            "conditionalAvailabilityExpression": [
                1
            ],
            "availabilityObjectMetadataId": [
                3
            ],
            "payload": [
                7
            ],
            "pageLayoutId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateCommandMenuItemInput": {
            "id": [
                3
            ],
            "label": [
                1
            ],
            "icon": [
                1
            ],
            "shortLabel": [
                1
            ],
            "position": [
                12
            ],
            "isPinned": [
                6
            ],
            "availabilityType": [
                37
            ],
            "availabilityObjectMetadataId": [
                3
            ],
            "engineComponentKey": [
                36
            ],
            "hotKeys": [
                1
            ],
            "pageLayoutId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "CreateFrontComponentInput": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "description": [
                1
            ],
            "sourceComponentPath": [
                1
            ],
            "builtComponentPath": [
                1
            ],
            "componentName": [
                1
            ],
            "builtComponentChecksum": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "UpdateFrontComponentInput": {
            "id": [
                3
            ],
            "update": [
                542
            ],
            "__typename": [
                1
            ]
        },
        "UpdateFrontComponentInputUpdates": {
            "name": [
                1
            ],
            "description": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateLogicFunctionFromSourceInput": {
            "id": [
                3
            ],
            "universalIdentifier": [
                3
            ],
            "name": [
                1
            ],
            "description": [
                1
            ],
            "timeoutSeconds": [
                12
            ],
            "source": [
                7
            ],
            "cronTriggerSettings": [
                7
            ],
            "databaseEventTriggerSettings": [
                7
            ],
            "httpRouteTriggerSettings": [
                7
            ],
            "serverRouteTriggerSettings": [
                7
            ],
            "toolTriggerSettings": [
                7
            ],
            "workflowActionTriggerSettings": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "ExecuteOneLogicFunctionInput": {
            "id": [
                3
            ],
            "payload": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "UpdateLogicFunctionFromSourceInput": {
            "id": [
                3
            ],
            "update": [
                546
            ],
            "__typename": [
                1
            ]
        },
        "UpdateLogicFunctionFromSourceInputUpdates": {
            "name": [
                1
            ],
            "description": [
                1
            ],
            "timeoutSeconds": [
                12
            ],
            "sourceHandlerCode": [
                1
            ],
            "handlerName": [
                1
            ],
            "sourceHandlerPath": [
                1
            ],
            "cronTriggerSettings": [
                7
            ],
            "databaseEventTriggerSettings": [
                7
            ],
            "httpRouteTriggerSettings": [
                7
            ],
            "toolTriggerSettings": [
                7
            ],
            "workflowActionTriggerSettings": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "CreatePageLayoutTabInput": {
            "title": [
                1
            ],
            "position": [
                12
            ],
            "pageLayoutId": [
                3
            ],
            "layoutMode": [
                86
            ],
            "__typename": [
                1
            ]
        },
        "UpdatePageLayoutTabInput": {
            "title": [
                1
            ],
            "position": [
                12
            ],
            "icon": [
                1
            ],
            "layoutMode": [
                86
            ],
            "__typename": [
                1
            ]
        },
        "CreatePageLayoutInput": {
            "name": [
                1
            ],
            "type": [
                122
            ],
            "objectMetadataId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdatePageLayoutInput": {
            "name": [
                1
            ],
            "type": [
                122
            ],
            "objectMetadataId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdatePageLayoutWithTabsInput": {
            "name": [
                1
            ],
            "type": [
                122
            ],
            "objectMetadataId": [
                3
            ],
            "tabs": [
                552
            ],
            "__typename": [
                1
            ]
        },
        "UpdatePageLayoutTabWithWidgetsInput": {
            "id": [
                3
            ],
            "title": [
                1
            ],
            "position": [
                12
            ],
            "icon": [
                1
            ],
            "layoutMode": [
                86
            ],
            "widgets": [
                553
            ],
            "__typename": [
                1
            ]
        },
        "UpdatePageLayoutWidgetWithIdInput": {
            "id": [
                3
            ],
            "pageLayoutTabId": [
                3
            ],
            "title": [
                1
            ],
            "type": [
                83
            ],
            "objectMetadataId": [
                3
            ],
            "gridPosition": [
                554
            ],
            "position": [
                7
            ],
            "configuration": [
                7
            ],
            "conditionalDisplay": [
                7
            ],
            "conditionalAvailabilityExpression": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "GridPositionInput": {
            "row": [
                12
            ],
            "column": [
                12
            ],
            "rowSpan": [
                12
            ],
            "columnSpan": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "CreateAgentInput": {
            "name": [
                1
            ],
            "label": [
                1
            ],
            "icon": [
                1
            ],
            "description": [
                1
            ],
            "prompt": [
                1
            ],
            "modelId": [
                1
            ],
            "roleId": [
                3
            ],
            "responseFormat": [
                7
            ],
            "modelConfiguration": [
                7
            ],
            "evaluationInputs": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "UpdateAgentInput": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "label": [
                1
            ],
            "icon": [
                1
            ],
            "description": [
                1
            ],
            "prompt": [
                1
            ],
            "modelId": [
                1
            ],
            "roleId": [
                3
            ],
            "responseFormat": [
                7
            ],
            "modelConfiguration": [
                7
            ],
            "evaluationInputs": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateRoleInput": {
            "id": [
                1
            ],
            "label": [
                1
            ],
            "description": [
                1
            ],
            "icon": [
                1
            ],
            "canUpdateAllSettings": [
                6
            ],
            "canAccessAllTools": [
                6
            ],
            "canReadAllObjectRecords": [
                6
            ],
            "canUpdateAllObjectRecords": [
                6
            ],
            "canSoftDeleteAllObjectRecords": [
                6
            ],
            "canDestroyAllObjectRecords": [
                6
            ],
            "canBeAssignedToUsers": [
                6
            ],
            "canBeAssignedToAgents": [
                6
            ],
            "canBeAssignedToApiKeys": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "UpdateRoleInput": {
            "update": [
                559
            ],
            "id": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateRolePayload": {
            "label": [
                1
            ],
            "description": [
                1
            ],
            "icon": [
                1
            ],
            "canUpdateAllSettings": [
                6
            ],
            "canAccessAllTools": [
                6
            ],
            "canReadAllObjectRecords": [
                6
            ],
            "canUpdateAllObjectRecords": [
                6
            ],
            "canSoftDeleteAllObjectRecords": [
                6
            ],
            "canDestroyAllObjectRecords": [
                6
            ],
            "canBeAssignedToUsers": [
                6
            ],
            "canBeAssignedToAgents": [
                6
            ],
            "canBeAssignedToApiKeys": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "UpsertObjectPermissionsInput": {
            "roleId": [
                3
            ],
            "objectPermissions": [
                561
            ],
            "__typename": [
                1
            ]
        },
        "ObjectPermissionInput": {
            "objectMetadataId": [
                3
            ],
            "canReadObjectRecords": [
                6
            ],
            "canUpdateObjectRecords": [
                6
            ],
            "canSoftDeleteObjectRecords": [
                6
            ],
            "canDestroyObjectRecords": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "UpsertPermissionFlagsInput": {
            "roleId": [
                3
            ],
            "permissionFlagKeys": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "UpsertFieldPermissionsInput": {
            "roleId": [
                3
            ],
            "fieldPermissions": [
                564
            ],
            "__typename": [
                1
            ]
        },
        "FieldPermissionInput": {
            "objectMetadataId": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "canReadFieldValue": [
                6
            ],
            "canUpdateFieldValue": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "UpsertRowLevelPermissionPredicatesInput": {
            "roleId": [
                3
            ],
            "objectMetadataId": [
                3
            ],
            "predicates": [
                566
            ],
            "predicateGroups": [
                567
            ],
            "__typename": [
                1
            ]
        },
        "RowLevelPermissionPredicateInput": {
            "id": [
                3
            ],
            "fieldMetadataId": [
                3
            ],
            "operand": [
                15
            ],
            "value": [
                7
            ],
            "subFieldName": [
                1
            ],
            "workspaceMemberFieldMetadataId": [
                1
            ],
            "workspaceMemberSubFieldName": [
                1
            ],
            "rowLevelPermissionPredicateGroupId": [
                3
            ],
            "positionInRowLevelPermissionPredicateGroup": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "RowLevelPermissionPredicateGroupInput": {
            "id": [
                3
            ],
            "objectMetadataId": [
                3
            ],
            "parentRowLevelPermissionPredicateGroupId": [
                3
            ],
            "logicalOperator": [
                13
            ],
            "positionInRowLevelPermissionPredicateGroup": [
                12
            ],
            "__typename": [
                1
            ]
        },
        "SetupOIDCSsoInput": {
            "name": [
                1
            ],
            "issuer": [
                1
            ],
            "clientID": [
                1
            ],
            "clientSecret": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "SetupSAMLSsoInput": {
            "name": [
                1
            ],
            "issuer": [
                1
            ],
            "id": [
                3
            ],
            "ssoURL": [
                1
            ],
            "certificate": [
                1
            ],
            "fingerprint": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "DeleteSsoInput": {
            "identityProviderId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "EditSsoInput": {
            "id": [
                3
            ],
            "status": [
                243
            ],
            "__typename": [
                1
            ]
        },
        "CreatePageLayoutWidgetInput": {
            "pageLayoutTabId": [
                3
            ],
            "title": [
                1
            ],
            "type": [
                83
            ],
            "objectMetadataId": [
                3
            ],
            "gridPosition": [
                554
            ],
            "position": [
                7
            ],
            "configuration": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "UpdatePageLayoutWidgetInput": {
            "pageLayoutTabId": [
                3
            ],
            "title": [
                1
            ],
            "type": [
                83
            ],
            "objectMetadataId": [
                3
            ],
            "gridPosition": [
                554
            ],
            "position": [
                7
            ],
            "configuration": [
                7
            ],
            "conditionalDisplay": [
                7
            ],
            "conditionalAvailabilityExpression": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateWebhookInput": {
            "id": [
                3
            ],
            "targetUrl": [
                1
            ],
            "operations": [
                1
            ],
            "description": [
                1
            ],
            "secret": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "UpdateWebhookInput": {
            "id": [
                3
            ],
            "update": [
                576
            ],
            "__typename": [
                1
            ]
        },
        "UpdateWebhookInputUpdates": {
            "targetUrl": [
                1
            ],
            "operations": [
                1
            ],
            "description": [
                1
            ],
            "secret": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "RunAgentInput": {
            "agentUniversalIdentifier": [
                1
            ],
            "prompt": [
                1
            ],
            "operationId": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "UpdateMessageFolderInput": {
            "id": [
                3
            ],
            "update": [
                579
            ],
            "__typename": [
                1
            ]
        },
        "UpdateMessageFolderInputUpdates": {
            "isSynced": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "UpdateMessageFoldersInput": {
            "ids": [
                3
            ],
            "update": [
                579
            ],
            "__typename": [
                1
            ]
        },
        "UpdateCalendarChannelInput": {
            "id": [
                3
            ],
            "update": [
                582
            ],
            "__typename": [
                1
            ]
        },
        "UpdateCalendarChannelInputUpdates": {
            "visibility": [
                392
            ],
            "isContactAutoCreationEnabled": [
                6
            ],
            "contactAutoCreationPolicy": [
                393
            ],
            "isSyncEnabled": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "FileAttachmentInput": {
            "id": [
                3
            ],
            "filename": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "AgentChatQuestionAnswerInput": {
            "questionIndex": [
                21
            ],
            "selectedOptionIndices": [
                21
            ],
            "freeText": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "AgentChatApprovalDecisionInput": {
            "decision": [
                1
            ],
            "comment": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "CreateSkillInput": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "label": [
                1
            ],
            "icon": [
                1
            ],
            "description": [
                1
            ],
            "content": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "UpdateSkillInput": {
            "id": [
                3
            ],
            "name": [
                1
            ],
            "label": [
                1
            ],
            "icon": [
                1
            ],
            "description": [
                1
            ],
            "content": [
                1
            ],
            "isActive": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "AnalyticsType": {},
        "ExcludeCampaignCreatorInput": {
            "campaignId": [
                3
            ],
            "campaignCreatorId": [
                3
            ],
            "reason": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "StartCampaignExecutionInput": {
            "campaignId": [
                3
            ],
            "startIdempotencyKey": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "UpdateCampaignSendingWindowInput": {
            "campaignId": [
                3
            ],
            "timeZone": [
                1
            ],
            "startLocalTime": [
                1
            ],
            "endLocalTime": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "StopCampaignExecutionInput": {
            "campaignId": [
                3
            ],
            "__typename": [
                1
            ]
        },
        "SendEmailInput": {
            "connectedAccountId": [
                1
            ],
            "to": [
                1
            ],
            "cc": [
                1
            ],
            "bcc": [
                1
            ],
            "subject": [
                1
            ],
            "body": [
                1
            ],
            "inReplyTo": [
                1
            ],
            "draftMessageId": [
                1
            ],
            "creatorId": [
                1
            ],
            "files": [
                594
            ],
            "__typename": [
                1
            ]
        },
        "SendEmailAttachmentInput": {
            "id": [
                1
            ],
            "name": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "UpdateLabPublicFeatureFlagInput": {
            "publicFeatureFlag": [
                1
            ],
            "value": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "CreateOneAppTokenInput": {
            "appToken": [
                597
            ],
            "__typename": [
                1
            ]
        },
        "CreateAppTokenInput": {
            "expiresAt": [
                4
            ],
            "__typename": [
                1
            ]
        },
        "Subscription": {
            "onEventSubscription": [
                192,
                {
                    "eventStreamId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "logicFunctionLogs": [
                195,
                {
                    "input": [
                        599,
                        "LogicFunctionLogsInput!"
                    ]
                }
            ],
            "onAgentChatEvent": [
                385,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "eventLogsLive": [
                374,
                {
                    "table": [
                        420,
                        "EventLogTable!"
                    ]
                }
            ],
            "__typename": [
                1
            ]
        },
        "LogicFunctionLogsInput": {
            "applicationId": [
                3
            ],
            "applicationUniversalIdentifier": [
                3
            ],
            "name": [
                1
            ],
            "id": [
                3
            ],
            "universalIdentifier": [
                3
            ],
            "__typename": [
                1
            ]
        }
    }
}