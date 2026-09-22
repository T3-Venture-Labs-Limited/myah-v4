export default {
    "scalars": [
        1,
        3,
        4,
        7,
        8,
        10,
        11,
        13,
        15,
        18,
        19,
        20,
        21,
        28,
        34,
        35,
        40,
        42,
        44,
        46,
        55,
        57,
        59,
        62,
        65,
        66,
        67,
        68,
        69,
        71,
        72,
        75,
        76,
        81,
        84,
        89,
        90,
        93,
        94,
        96,
        99,
        100,
        106,
        120,
        128,
        129,
        130,
        132,
        141,
        159,
        161,
        165,
        166,
        167,
        168,
        169,
        170,
        171,
        178,
        183,
        186,
        188,
        192,
        211,
        227,
        230,
        234,
        235,
        245,
        249,
        303,
        306,
        309,
        330,
        332,
        367,
        368,
        369,
        370,
        372,
        374,
        397,
        405,
        416,
        417,
        553
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
                127
            ],
            "on_BillingLicensedProduct": [
                136
            ],
            "on_BillingMeteredProduct": [
                137
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
                26
            ],
            "__typename": [
                1
            ]
        },
        "UUID": {},
        "DateTime": {},
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
                8
            ],
            "positionInRowLevelPermissionPredicateGroup": [
                7
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
                10
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
                7
            ],
            "roleId": [
                1
            ],
            "value": [
                11
            ],
            "__typename": [
                1
            ]
        },
        "RowLevelPermissionPredicateOperand": {},
        "JSON": {},
        "ObjectPermission": {
            "objectMetadataId": [
                3
            ],
            "canReadObjectRecords": [
                13
            ],
            "canUpdateObjectRecords": [
                13
            ],
            "canSoftDeleteObjectRecords": [
                13
            ],
            "canDestroyObjectRecords": [
                13
            ],
            "restrictedFields": [
                11
            ],
            "rowLevelPermissionPredicates": [
                9
            ],
            "rowLevelPermissionPredicateGroups": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "Boolean": {},
        "UserWorkspace": {
            "id": [
                3
            ],
            "user": [
                74
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
                15
            ],
            "objectPermissions": [
                12
            ],
            "objectsPermissions": [
                12
            ],
            "twoFactorAuthenticationMethodSummary": [
                5
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
                16
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
                18
            ],
            "timeZone": [
                1
            ],
            "dateFormat": [
                19
            ],
            "timeFormat": [
                20
            ],
            "roles": [
                26
            ],
            "userWorkspaceId": [
                3
            ],
            "numberFormat": [
                21
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
                11
            ],
            "roleId": [
                3
            ],
            "isCustom": [
                13
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
                11
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
                13
            ],
            "canUpdateFieldValue": [
                13
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
                13
            ],
            "canBeAssignedToUsers": [
                13
            ],
            "canBeAssignedToAgents": [
                13
            ],
            "canBeAssignedToApiKeys": [
                13
            ],
            "workspaceMembers": [
                17
            ],
            "agents": [
                22
            ],
            "apiKeys": [
                25
            ],
            "canUpdateAllSettings": [
                13
            ],
            "canAccessAllTools": [
                13
            ],
            "canReadAllObjectRecords": [
                13
            ],
            "canUpdateAllObjectRecords": [
                13
            ],
            "canSoftDeleteAllObjectRecords": [
                13
            ],
            "canDestroyAllObjectRecords": [
                13
            ],
            "permissionFlags": [
                24
            ],
            "objectPermissions": [
                12
            ],
            "fieldPermissions": [
                23
            ],
            "rowLevelPermissionPredicates": [
                9
            ],
            "rowLevelPermissionPredicateGroups": [
                6
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
                28
            ],
            "logoUrl": [
                1
            ],
            "__typename": [
                1
            ]
        },
        "ApplicationRegistrationSourceType": {},
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
                13
            ],
            "type": [
                1
            ],
            "options": [
                11
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
                30
            ],
            "applicationRefreshToken": [
                30
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
                13
            ],
            "usesSdkClient": [
                13
            ],
            "applicationTokenPair": [
                31
            ],
            "applicationVariables": [
                11
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
                32
            ],
            "engineComponentKey": [
                34
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
                7
            ],
            "isPinned": [
                13
            ],
            "availabilityType": [
                35
            ],
            "payload": [
                36
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
                13
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
                37
            ],
            "on_ObjectMetadataCommandMenuItemPayload": [
                38
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
                7
            ],
            "executionMode": [
                40
            ],
            "sourceHandlerPath": [
                1
            ],
            "handlerName": [
                1
            ],
            "cronTriggerSettings": [
                11
            ],
            "databaseEventTriggerSettings": [
                11
            ],
            "httpRouteTriggerSettings": [
                11
            ],
            "toolTriggerSettings": [
                11
            ],
            "workflowActionTriggerSettings": [
                11
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
                42
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
                13
            ],
            "isSystem": [
                13
            ],
            "isUIEditable": [
                13
            ],
            "isUIReadOnly": [
                13
            ],
            "isNullable": [
                13
            ],
            "isUnique": [
                13
            ],
            "defaultValue": [
                11
            ],
            "options": [
                11
            ],
            "settings": [
                11
            ],
            "objectMetadataId": [
                3
            ],
            "isLabelSyncedWithName": [
                13
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
                226
            ],
            "morphRelations": [
                226
            ],
            "object": [
                50
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
                13
            ],
            "isUnique": [
                13
            ],
            "indexWhereClause": [
                1
            ],
            "indexType": [
                44
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "indexFieldMetadataList": [
                194
            ],
            "objectMetadata": [
                199,
                {
                    "paging": [
                        45,
                        "CursorPaging!"
                    ],
                    "filter": [
                        47,
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
                46
            ],
            "after": [
                46
            ],
            "first": [
                18
            ],
            "last": [
                18
            ],
            "__typename": [
                1
            ]
        },
        "ConnectionCursor": {},
        "ObjectFilter": {
            "and": [
                47
            ],
            "or": [
                47
            ],
            "id": [
                48
            ],
            "isRemote": [
                49
            ],
            "isActive": [
                49
            ],
            "isSystem": [
                49
            ],
            "isUIEditable": [
                49
            ],
            "isUICreatable": [
                49
            ],
            "isUIReadOnly": [
                49
            ],
            "isSearchable": [
                49
            ],
            "__typename": [
                1
            ]
        },
        "UUIDFilterComparison": {
            "is": [
                13
            ],
            "isNot": [
                13
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
                13
            ],
            "isNot": [
                13
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
                13
            ],
            "isActive": [
                13
            ],
            "isSystem": [
                13
            ],
            "isUIEditable": [
                13
            ],
            "isUICreatable": [
                13
            ],
            "isUIReadOnly": [
                13
            ],
            "isSearchable": [
                13
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
                13
            ],
            "duplicateCriteria": [
                1
            ],
            "fieldsList": [
                41
            ],
            "indexMetadataList": [
                43
            ],
            "searchFieldMetadataList": [
                201
            ],
            "fields": [
                205,
                {
                    "paging": [
                        45,
                        "CursorPaging!"
                    ],
                    "filter": [
                        51,
                        "FieldFilter!"
                    ]
                }
            ],
            "indexMetadatas": [
                203,
                {
                    "paging": [
                        45,
                        "CursorPaging!"
                    ],
                    "filter": [
                        52,
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
                51
            ],
            "or": [
                51
            ],
            "id": [
                48
            ],
            "isActive": [
                49
            ],
            "isSystem": [
                49
            ],
            "isUIEditable": [
                49
            ],
            "isUIReadOnly": [
                49
            ],
            "objectMetadataId": [
                48
            ],
            "__typename": [
                1
            ]
        },
        "IndexFilter": {
            "and": [
                52
            ],
            "or": [
                52
            ],
            "id": [
                48
            ],
            "isCustom": [
                49
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
                11
            ],
            "applicationRegistrationId": [
                3
            ],
            "canBeUninstalled": [
                13
            ],
            "defaultRoleId": [
                1
            ],
            "settingsCustomTabFrontComponentId": [
                3
            ],
            "defaultLogicFunctionRole": [
                26
            ],
            "agents": [
                22
            ],
            "frontComponents": [
                32
            ],
            "commandMenuItems": [
                33
            ],
            "logicFunctions": [
                39
            ],
            "objects": [
                50
            ],
            "applicationVariables": [
                29
            ],
            "applicationRegistration": [
                27
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
                13
            ],
            "size": [
                7
            ],
            "position": [
                7
            ],
            "aggregateOperation": [
                55
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
                13
            ],
            "deletedAt": [
                4
            ],
            "isOverridden": [
                13
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
                57
            ],
            "positionInViewFilterGroup": [
                7
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
                59
            ],
            "value": [
                11
            ],
            "viewFilterGroupId": [
                3
            ],
            "positionInViewFilterGroup": [
                7
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
                13
            ],
            "fieldValue": [
                1
            ],
            "position": [
                7
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
                62
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
                7
            ],
            "isVisible": [
                13
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
                13
            ],
            "deletedAt": [
                4
            ],
            "viewFields": [
                54
            ],
            "isOverridden": [
                13
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
                65
            ],
            "key": [
                66
            ],
            "icon": [
                1
            ],
            "position": [
                7
            ],
            "isCompact": [
                13
            ],
            "isCustom": [
                13
            ],
            "openRecordIn": [
                67
            ],
            "kanbanAggregateOperation": [
                55
            ],
            "kanbanAggregateOperationFieldMetadataId": [
                3
            ],
            "mainGroupByFieldMetadataId": [
                3
            ],
            "shouldHideEmptyGroups": [
                13
            ],
            "kanbanColumnWidth": [
                18
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
                68
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
                54
            ],
            "viewFilters": [
                58
            ],
            "viewFilterGroups": [
                56
            ],
            "viewSorts": [
                61
            ],
            "viewGroups": [
                60
            ],
            "viewFieldGroups": [
                63
            ],
            "visibility": [
                69
            ],
            "createdByUserWorkspaceId": [
                3
            ],
            "isActive": [
                13
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
                13
            ],
            "isPublicInviteLinkEnabled": [
                13
            ],
            "workspaceDiscoverability": [
                71
            ],
            "trashRetentionDays": [
                7
            ],
            "eventLogRetentionDays": [
                7
            ],
            "workspaceMembersCount": [
                7
            ],
            "activationStatus": [
                72
            ],
            "views": [
                64
            ],
            "viewFields": [
                54
            ],
            "viewFilters": [
                58
            ],
            "viewFilterGroups": [
                56
            ],
            "viewGroups": [
                60
            ],
            "viewSorts": [
                61
            ],
            "metadataVersion": [
                7
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
                13
            ],
            "isGoogleAuthBypassEnabled": [
                13
            ],
            "isTwoFactorAuthenticationEnforced": [
                13
            ],
            "isPasswordAuthEnabled": [
                13
            ],
            "isPasswordAuthBypassEnabled": [
                13
            ],
            "isMicrosoftAuthEnabled": [
                13
            ],
            "isMicrosoftAuthBypassEnabled": [
                13
            ],
            "isCustomDomainEnabled": [
                13
            ],
            "isInternalMessagesImportEnabled": [
                13
            ],
            "editableProfileFields": [
                1
            ],
            "defaultRole": [
                26
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
                13
            ],
            "routerModel": [
                1
            ],
            "workspaceCustomApplication": [
                53
            ],
            "featureFlags": [
                248
            ],
            "billingSubscriptions": [
                140
            ],
            "installedApplications": [
                53
            ],
            "currentBillingSubscription": [
                140
            ],
            "billingCustomer": [
                139
            ],
            "billingEntitlements": [
                244
            ],
            "hasValidSignedEnterpriseKey": [
                13
            ],
            "hasValidEnterpriseValidityToken": [
                13
            ],
            "workspaceUrls": [
                239
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
                13
            ],
            "disabled": [
                13
            ],
            "canImpersonate": [
                13
            ],
            "canAccessFullAdminPanel": [
                13
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
                17
            ],
            "userWorkspaces": [
                14
            ],
            "onboardingStatus": [
                75
            ],
            "currentWorkspace": [
                70
            ],
            "currentUserWorkspace": [
                14
            ],
            "userVars": [
                76
            ],
            "workspaceMembers": [
                17
            ],
            "deletedWorkspaceMembers": [
                243
            ],
            "hasPassword": [
                13
            ],
            "supportUserHash": [
                1
            ],
            "isMyahTeamMember": [
                13
            ],
            "workspaces": [
                14
            ],
            "availableWorkspaces": [
                242
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
                7
            ],
            "column": [
                7
            ],
            "rowSpan": [
                7
            ],
            "columnSpan": [
                7
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
                81
            ],
            "objectMetadataId": [
                3
            ],
            "gridPosition": [
                79
            ],
            "position": [
                82
            ],
            "configuration": [
                87
            ],
            "conditionalDisplay": [
                11
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
                13
            ],
            "deletedAt": [
                4
            ],
            "isOverridden": [
                13
            ],
            "__typename": [
                1
            ]
        },
        "WidgetType": {},
        "PageLayoutWidgetPosition": {
            "on_PageLayoutWidgetGridPosition": [
                83
            ],
            "on_PageLayoutWidgetVerticalListPosition": [
                85
            ],
            "on_PageLayoutWidgetCanvasPosition": [
                86
            ],
            "__typename": [
                1
            ]
        },
        "PageLayoutWidgetGridPosition": {
            "layoutMode": [
                84
            ],
            "row": [
                18
            ],
            "column": [
                18
            ],
            "rowSpan": [
                18
            ],
            "columnSpan": [
                18
            ],
            "__typename": [
                1
            ]
        },
        "PageLayoutTabLayoutMode": {},
        "PageLayoutWidgetVerticalListPosition": {
            "layoutMode": [
                84
            ],
            "index": [
                18
            ],
            "__typename": [
                1
            ]
        },
        "PageLayoutWidgetCanvasPosition": {
            "layoutMode": [
                84
            ],
            "__typename": [
                1
            ]
        },
        "WidgetConfiguration": {
            "on_AggregateChartConfiguration": [
                88
            ],
            "on_StandaloneRichTextConfiguration": [
                91
            ],
            "on_PieChartConfiguration": [
                92
            ],
            "on_LineChartConfiguration": [
                95
            ],
            "on_IframeConfiguration": [
                97
            ],
            "on_BarChartConfiguration": [
                98
            ],
            "on_CalendarConfiguration": [
                101
            ],
            "on_FrontComponentConfiguration": [
                102
            ],
            "on_EmailsConfiguration": [
                103
            ],
            "on_EmailThreadConfiguration": [
                104
            ],
            "on_FieldConfiguration": [
                105
            ],
            "on_FieldRichTextConfiguration": [
                107
            ],
            "on_FieldsConfiguration": [
                108
            ],
            "on_FilesConfiguration": [
                109
            ],
            "on_NotesConfiguration": [
                110
            ],
            "on_TasksConfiguration": [
                111
            ],
            "on_TimelineConfiguration": [
                112
            ],
            "on_ViewConfiguration": [
                113
            ],
            "on_RecordTableConfiguration": [
                114
            ],
            "on_WorkflowConfiguration": [
                115
            ],
            "on_WorkflowRunConfiguration": [
                116
            ],
            "on_WorkflowVersionConfiguration": [
                117
            ],
            "__typename": [
                1
            ]
        },
        "AggregateChartConfiguration": {
            "configurationType": [
                89
            ],
            "aggregateFieldMetadataId": [
                3
            ],
            "aggregateOperation": [
                55
            ],
            "label": [
                1
            ],
            "displayDataLabel": [
                13
            ],
            "numberFormat": [
                90
            ],
            "description": [
                1
            ],
            "filter": [
                11
            ],
            "timezone": [
                1
            ],
            "firstDayOfTheWeek": [
                18
            ],
            "prefix": [
                1
            ],
            "suffix": [
                1
            ],
            "ratioAggregateConfig": [
                77
            ],
            "__typename": [
                1
            ]
        },
        "WidgetConfigurationType": {},
        "ChartNumberFormat": {},
        "StandaloneRichTextConfiguration": {
            "configurationType": [
                89
            ],
            "body": [
                78
            ],
            "__typename": [
                1
            ]
        },
        "PieChartConfiguration": {
            "configurationType": [
                89
            ],
            "aggregateFieldMetadataId": [
                3
            ],
            "aggregateOperation": [
                55
            ],
            "groupByFieldMetadataId": [
                3
            ],
            "groupBySubFieldName": [
                1
            ],
            "dateGranularity": [
                93
            ],
            "orderBy": [
                94
            ],
            "manualSortOrder": [
                1
            ],
            "displayDataLabel": [
                13
            ],
            "showCenterMetric": [
                13
            ],
            "displayLegend": [
                13
            ],
            "hideEmptyCategory": [
                13
            ],
            "splitMultiValueFields": [
                13
            ],
            "description": [
                1
            ],
            "color": [
                1
            ],
            "filter": [
                11
            ],
            "timezone": [
                1
            ],
            "firstDayOfTheWeek": [
                18
            ],
            "__typename": [
                1
            ]
        },
        "ObjectRecordGroupByDateGranularity": {},
        "GraphOrderBy": {},
        "LineChartConfiguration": {
            "configurationType": [
                89
            ],
            "aggregateFieldMetadataId": [
                3
            ],
            "aggregateOperation": [
                55
            ],
            "primaryAxisGroupByFieldMetadataId": [
                3
            ],
            "primaryAxisGroupBySubFieldName": [
                1
            ],
            "primaryAxisDateGranularity": [
                93
            ],
            "primaryAxisOrderBy": [
                94
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
                93
            ],
            "secondaryAxisOrderBy": [
                94
            ],
            "secondaryAxisManualSortOrder": [
                1
            ],
            "omitNullValues": [
                13
            ],
            "splitMultiValueFields": [
                13
            ],
            "axisNameDisplay": [
                96
            ],
            "displayDataLabel": [
                13
            ],
            "displayLegend": [
                13
            ],
            "rangeMin": [
                7
            ],
            "rangeMax": [
                7
            ],
            "description": [
                1
            ],
            "color": [
                1
            ],
            "filter": [
                11
            ],
            "isStacked": [
                13
            ],
            "isCumulative": [
                13
            ],
            "timezone": [
                1
            ],
            "firstDayOfTheWeek": [
                18
            ],
            "__typename": [
                1
            ]
        },
        "AxisNameDisplay": {},
        "IframeConfiguration": {
            "configurationType": [
                89
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
                89
            ],
            "aggregateFieldMetadataId": [
                3
            ],
            "aggregateOperation": [
                55
            ],
            "primaryAxisGroupByFieldMetadataId": [
                3
            ],
            "primaryAxisGroupBySubFieldName": [
                1
            ],
            "primaryAxisDateGranularity": [
                93
            ],
            "primaryAxisOrderBy": [
                94
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
                93
            ],
            "secondaryAxisOrderBy": [
                94
            ],
            "secondaryAxisManualSortOrder": [
                1
            ],
            "omitNullValues": [
                13
            ],
            "splitMultiValueFields": [
                13
            ],
            "axisNameDisplay": [
                96
            ],
            "displayDataLabel": [
                13
            ],
            "displayLegend": [
                13
            ],
            "rangeMin": [
                7
            ],
            "rangeMax": [
                7
            ],
            "description": [
                1
            ],
            "color": [
                1
            ],
            "filter": [
                11
            ],
            "groupMode": [
                99
            ],
            "layout": [
                100
            ],
            "isCumulative": [
                13
            ],
            "timezone": [
                1
            ],
            "firstDayOfTheWeek": [
                18
            ],
            "__typename": [
                1
            ]
        },
        "BarChartGroupMode": {},
        "BarChartLayout": {},
        "CalendarConfiguration": {
            "configurationType": [
                89
            ],
            "__typename": [
                1
            ]
        },
        "FrontComponentConfiguration": {
            "configurationType": [
                89
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
                89
            ],
            "__typename": [
                1
            ]
        },
        "EmailThreadConfiguration": {
            "configurationType": [
                89
            ],
            "__typename": [
                1
            ]
        },
        "FieldConfiguration": {
            "configurationType": [
                89
            ],
            "fieldMetadataId": [
                1
            ],
            "fieldDisplayMode": [
                106
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
                89
            ],
            "__typename": [
                1
            ]
        },
        "FieldsConfiguration": {
            "configurationType": [
                89
            ],
            "viewId": [
                1
            ],
            "newFieldDefaultVisibility": [
                13
            ],
            "shouldAllowUserToSeeHiddenFields": [
                13
            ],
            "__typename": [
                1
            ]
        },
        "FilesConfiguration": {
            "configurationType": [
                89
            ],
            "__typename": [
                1
            ]
        },
        "NotesConfiguration": {
            "configurationType": [
                89
            ],
            "__typename": [
                1
            ]
        },
        "TasksConfiguration": {
            "configurationType": [
                89
            ],
            "__typename": [
                1
            ]
        },
        "TimelineConfiguration": {
            "configurationType": [
                89
            ],
            "__typename": [
                1
            ]
        },
        "ViewConfiguration": {
            "configurationType": [
                89
            ],
            "__typename": [
                1
            ]
        },
        "RecordTableConfiguration": {
            "configurationType": [
                89
            ],
            "viewId": [
                1
            ],
            "recordLimit": [
                18
            ],
            "__typename": [
                1
            ]
        },
        "WorkflowConfiguration": {
            "configurationType": [
                89
            ],
            "__typename": [
                1
            ]
        },
        "WorkflowRunConfiguration": {
            "configurationType": [
                89
            ],
            "__typename": [
                1
            ]
        },
        "WorkflowVersionConfiguration": {
            "configurationType": [
                89
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
                7
            ],
            "pageLayoutId": [
                3
            ],
            "widgets": [
                80
            ],
            "icon": [
                1
            ],
            "layoutMode": [
                84
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "isActive": [
                13
            ],
            "deletedAt": [
                4
            ],
            "isOverridden": [
                13
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
                120
            ],
            "objectMetadataId": [
                3
            ],
            "tabs": [
                118
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
                13
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
                121
            ],
            "__typename": [
                1
            ]
        },
        "EnterpriseLicenseInfoDTO": {
            "isValid": [
                13
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
                13
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
                7
            ],
            "__typename": [
                1
            ]
        },
        "BillingSubscriptionSchedulePhase": {
            "start_date": [
                7
            ],
            "end_date": [
                7
            ],
            "items": [
                125
            ],
            "__typename": [
                1
            ]
        },
        "BillingProductMetadata": {
            "planKey": [
                128
            ],
            "priceUsageBased": [
                129
            ],
            "productKey": [
                130
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
                132
            ],
            "unitAmount": [
                7
            ],
            "stripePriceId": [
                1
            ],
            "priceUsageType": [
                129
            ],
            "creditAmount": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "SubscriptionInterval": {},
        "BillingPriceTier": {
            "upTo": [
                7
            ],
            "flatAmount": [
                7
            ],
            "unitAmount": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "BillingPriceMetered": {
            "tiers": [
                133
            ],
            "recurringInterval": [
                132
            ],
            "stripePriceId": [
                1
            ],
            "priceUsageType": [
                129
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
                127
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
                127
            ],
            "prices": [
                131
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
                127
            ],
            "prices": [
                134
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
                13
            ],
            "quantity": [
                7
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
                13
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
                141
            ],
            "interval": [
                132
            ],
            "billingSubscriptionItems": [
                138
            ],
            "currentPeriodEnd": [
                4
            ],
            "metadata": [
                11
            ],
            "phases": [
                126
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
                141
            ],
            "hasPaymentMethod": [
                13
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
                130
            ],
            "periodStart": [
                4
            ],
            "periodEnd": [
                4
            ],
            "usedCredits": [
                7
            ],
            "grantedCredits": [
                7
            ],
            "rolloverCredits": [
                7
            ],
            "totalGrantedCredits": [
                7
            ],
            "unitPriceCents": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "BillingPlan": {
            "planKey": [
                128
            ],
            "baseProducts": [
                136
            ],
            "resourceCreditProducts": [
                136
            ],
            "meteredProducts": [
                137
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
                140
            ],
            "billingSubscriptions": [
                140
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
                7
            ],
            "expiryYear": [
                7
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
                148
            ],
            "card": [
                149
            ],
            "name": [
                1
            ],
            "paymentMethodReady": [
                13
            ],
            "taxId": [
                150
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderAiTopUpPolicy": {
            "incrementCents": [
                18
            ],
            "minimumPrincipalCents": [
                18
            ],
            "maximumPrincipalCents": [
                18
            ],
            "suggestedPrincipalCents": [
                18
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
                13
            ],
            "__typename": [
                1
            ]
        },
        "ManagedProviderCustomerFundingPaymentMethod": {
            "ready": [
                13
            ],
            "clientSecret": [
                1
            ],
            "billingSummary": [
                151
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
                13
            ],
            "prepaidBalanceCents": [
                1
            ],
            "pendingOperationCount": [
                18
            ],
            "reconciliationRequiredOperationCount": [
                18
            ],
            "customerFundingAvailable": [
                13
            ],
            "customerFundingPaymentMethodReady": [
                13
            ],
            "customerFundingPolicy": [
                152
            ],
            "customerFundingHistory": [
                153
            ],
            "customerFundingBillingSummary": [
                151
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
                7
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
                159
            ],
            "verificationRecords": [
                157
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
                7
            ],
            "username": [
                1
            ],
            "connectionSecurity": [
                161
            ],
            "__typename": [
                1
            ]
        },
        "EmailConnectionSecurity": {},
        "PublicImapSmtpCaldavConnectionParameters": {
            "IMAP": [
                160
            ],
            "SMTP": [
                160
            ],
            "CALDAV": [
                160
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
                18
            ],
            "minimumSendIntervalMs": [
                18
            ],
            "createdAt": [
                4
            ],
            "updatedAt": [
                4
            ],
            "connectionParameters": [
                162
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
                165
            ],
            "handle": [
                1
            ],
            "type": [
                166
            ],
            "isContactAutoCreationEnabled": [
                13
            ],
            "contactAutoCreationPolicy": [
                167
            ],
            "messageFolderImportPolicy": [
                168
            ],
            "excludeNonProfessionalEmails": [
                13
            ],
            "excludeGroupEmails": [
                13
            ],
            "pendingGroupEmailsAction": [
                169
            ],
            "isSyncEnabled": [
                13
            ],
            "syncedAt": [
                4
            ],
            "syncStatus": [
                170
            ],
            "syncStage": [
                171
            ],
            "syncStageStartedAt": [
                4
            ],
            "throttleFailureCount": [
                7
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
                163
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
                164
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
                18
            ],
            "withoutEmail": [
                18
            ],
            "duplicateEmails": [
                18
            ],
            "globallyUnsubscribed": [
                18
            ],
            "topicUnsubscribed": [
                18
            ],
            "sendable": [
                18
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
                18
            ],
            "deduped": [
                18
            ],
            "overCap": [
                18
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
                18
            ],
            "skipped": [
                175
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
                178
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
                7
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
                183
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
                7
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
                181
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
                11
            ],
            "after": [
                11
            ],
            "diff": [
                11
            ],
            "__typename": [
                1
            ]
        },
        "MetadataEvent": {
            "type": [
                186
            ],
            "metadataName": [
                1
            ],
            "recordId": [
                1
            ],
            "properties": [
                184
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
                188
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
                184
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
                187
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
                189
            ],
            "metadataEvents": [
                185
            ],
            "__typename": [
                1
            ]
        },
        "LogicFunctionExecutionResult": {
            "data": [
                11
            ],
            "logs": [
                1
            ],
            "duration": [
                7
            ],
            "status": [
                192
            ],
            "error": [
                11
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
                7
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
                43
            ],
            "cursor": [
                46
            ],
            "__typename": [
                1
            ]
        },
        "PageInfo": {
            "hasNextPage": [
                13
            ],
            "hasPreviousPage": [
                13
            ],
            "startCursor": [
                46
            ],
            "endCursor": [
                46
            ],
            "__typename": [
                1
            ]
        },
        "IndexConnection": {
            "pageInfo": [
                196
            ],
            "edges": [
                195
            ],
            "__typename": [
                1
            ]
        },
        "ObjectEdge": {
            "node": [
                50
            ],
            "cursor": [
                46
            ],
            "__typename": [
                1
            ]
        },
        "IndexObjectMetadataConnection": {
            "pageInfo": [
                196
            ],
            "edges": [
                198
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
                18
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
        "ObjectConnection": {
            "pageInfo": [
                196
            ],
            "edges": [
                198
            ],
            "__typename": [
                1
            ]
        },
        "ObjectIndexMetadatasConnection": {
            "pageInfo": [
                196
            ],
            "edges": [
                195
            ],
            "__typename": [
                1
            ]
        },
        "FieldEdge": {
            "node": [
                41
            ],
            "cursor": [
                46
            ],
            "__typename": [
                1
            ]
        },
        "ObjectFieldsConnection": {
            "pageInfo": [
                196
            ],
            "edges": [
                204
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
                18
            ],
            "minimumSendIntervalMs": [
                18
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
                206
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
                206
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
                13
            ],
            "health": [
                211
            ],
            "senderReadiness": [
                209
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
                13
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
                212
            ],
            "campaignCreatorLists": [
                213
            ],
            "__typename": [
                1
            ]
        },
        "CampaignCreatorListRemovalImpactDTO": {
            "requiresConfirmation": [
                13
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
                13
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
                13
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
                13
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
                13
            ],
            "errors": [
                1
            ],
            "result": [
                221
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
                18
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
                18
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
                223
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
                223
            ],
            "__typename": [
                1
            ]
        },
        "Relation": {
            "type": [
                227
            ],
            "sourceObjectMetadata": [
                50
            ],
            "targetObjectMetadata": [
                50
            ],
            "sourceFieldMetadata": [
                41
            ],
            "targetFieldMetadata": [
                41
            ],
            "__typename": [
                1
            ]
        },
        "RelationType": {},
        "FieldConnection": {
            "pageInfo": [
                196
            ],
            "edges": [
                204
            ],
            "__typename": [
                1
            ]
        },
        "AppConnection": {
            "id": [
                230
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
                13
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
                234
            ],
            "issuer": [
                1
            ],
            "name": [
                1
            ],
            "status": [
                235
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
                234
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
                235
            ],
            "workspace": [
                236
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
                234
            ],
            "issuer": [
                1
            ],
            "name": [
                1
            ],
            "status": [
                235
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
                234
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
                235
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
                239
            ],
            "logo": [
                1
            ],
            "sso": [
                240
            ],
            "__typename": [
                1
            ]
        },
        "AvailableWorkspaces": {
            "availableWorkspacesForSignIn": [
                241
            ],
            "availableWorkspacesForSignUp": [
                241
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
                16
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
        "BillingEntitlement": {
            "key": [
                245
            ],
            "value": [
                13
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
                246
            ],
            "isCustomDomainEnabled": [
                13
            ],
            "__typename": [
                1
            ]
        },
        "FeatureFlag": {
            "key": [
                249
            ],
            "value": [
                13
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
                234
            ],
            "status": [
                235
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
                250
            ],
            "google": [
                13
            ],
            "magicLink": [
                13
            ],
            "password": [
                13
            ],
            "microsoft": [
                13
            ],
            "__typename": [
                1
            ]
        },
        "AuthBypassProviders": {
            "google": [
                13
            ],
            "password": [
                13
            ],
            "microsoft": [
                13
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
                251
            ],
            "authBypassProviders": [
                252
            ],
            "logo": [
                1
            ],
            "displayName": [
                1
            ],
            "workspaceUrls": [
                239
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
                9
            ],
            "predicateGroups": [
                6
            ],
            "__typename": [
                1
            ]
        },
        "DeleteTwoFactorAuthenticationMethod": {
            "success": [
                13
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
                13
            ],
            "__typename": [
                1
            ]
        },
        "AuthTokenPair": {
            "accessOrWorkspaceAgnosticToken": [
                30
            ],
            "refreshToken": [
                30
            ],
            "__typename": [
                1
            ]
        },
        "AvailableWorkspacesAndAccessTokens": {
            "tokens": [
                259
            ],
            "availableWorkspaces": [
                242
            ],
            "__typename": [
                1
            ]
        },
        "EmailPasswordResetLink": {
            "success": [
                13
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
                13
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceUrlsAndId": {
            "workspaceUrls": [
                239
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
                30
            ],
            "workspace": [
                264
            ],
            "__typename": [
                1
            ]
        },
        "TransientToken": {
            "transientToken": [
                30
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
                13
            ],
            "__typename": [
                1
            ]
        },
        "VerifyEmailAndGetLoginToken": {
            "loginToken": [
                30
            ],
            "workspaceUrls": [
                239
            ],
            "__typename": [
                1
            ]
        },
        "SubdomainAvailabilityDTO": {
            "isValid": [
                13
            ],
            "available": [
                13
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
                259
            ],
            "__typename": [
                1
            ]
        },
        "LoginToken": {
            "loginToken": [
                30
            ],
            "__typename": [
                1
            ]
        },
        "CheckUserExist": {
            "exists": [
                13
            ],
            "availableWorkspacesCount": [
                7
            ],
            "isEmailVerified": [
                13
            ],
            "__typename": [
                1
            ]
        },
        "WorkspaceInviteHashValid": {
            "isValid": [
                13
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
                7
            ],
            "username": [
                1
            ],
            "connectionSecurity": [
                161
            ],
            "__typename": [
                1
            ]
        },
        "ImapSmtpCaldavPublicConnectionParameters": {
            "IMAP": [
                276
            ],
            "SMTP": [
                276
            ],
            "CALDAV": [
                276
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
                277
            ],
            "__typename": [
                1
            ]
        },
        "ImapSmtpCaldavConnectionSuccess": {
            "success": [
                13
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
                13
            ],
            "actionRequiredCount": [
                18
            ],
            "domainCount": [
                18
            ],
            "mailboxCount": [
                18
            ],
            "readyCount": [
                18
            ],
            "status": [
                1
            ],
            "warmingCount": [
                18
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailDomain": {
            "cancelAtPeriodEnd": [
                13
            ],
            "dependentMailboxCount": [
                18
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
                13
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
                18
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
                13
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
                18
            ],
            "safeFailureCode": [
                1
            ],
            "servicePaidThrough": [
                4
            ],
            "warmupCancelAtPeriodEnd": [
                13
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
                13
            ],
            "mailboxes": [
                283
            ],
            "mailboxCount": [
                18
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
                286
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailProposal": {
            "disclosures": [
                285
            ],
            "domains": [
                287
            ],
            "expiresAt": [
                4
            ],
            "id": [
                1
            ],
            "mailboxCount": [
                18
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
                18
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
                18
            ],
            "startingAt": [
                4
            ],
            "unitPriceCents": [
                18
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
                285
            ],
            "dueTodayCents": [
                18
            ],
            "expiresAt": [
                4
            ],
            "id": [
                1
            ],
            "lines": [
                289
            ],
            "quoteFingerprint": [
                1
            ],
            "quoteVersion": [
                1
            ],
            "isSandbox": [
                13
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
                13
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailPaymentMethodStatus": {
            "ready": [
                13
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
                18
            ],
            "recurringAmountCents": [
                18
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
                18
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
                18
            ],
            "campaignEligibility": [
                1
            ],
            "lastEvaluatedAt": [
                4
            ],
            "policySafeDailyCapacity": [
                18
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
                13
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
                297
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
                13
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
                7
            ],
            "isCreditCardRequired": [
                13
            ],
            "__typename": [
                1
            ]
        },
        "NativeModelCapabilities": {
            "webSearch": [
                13
            ],
            "twitterSearch": [
                13
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
                303
            ],
            "modelFamilyLabel": [
                1
            ],
            "sdkPackage": [
                1
            ],
            "inputCostPerMillionTokens": [
                7
            ],
            "outputCostPerMillionTokens": [
                7
            ],
            "nativeCapabilities": [
                301
            ],
            "isDeprecated": [
                13
            ],
            "isRecommended": [
                13
            ],
            "providerName": [
                1
            ],
            "providerLabel": [
                1
            ],
            "contextWindowTokens": [
                7
            ],
            "maxOutputTokens": [
                7
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
                13
            ],
            "billingUrl": [
                1
            ],
            "stripePublishableKey": [
                1
            ],
            "trialPeriods": [
                300
            ],
            "__typename": [
                1
            ]
        },
        "Support": {
            "supportDriver": [
                306
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
                309
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
                7
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
                249
            ],
            "metadata": [
                311
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
                251
            ],
            "billing": [
                304
            ],
            "aiModels": [
                302
            ],
            "signInPrefilled": [
                13
            ],
            "isMultiWorkspaceEnabled": [
                13
            ],
            "isEmailVerificationRequired": [
                13
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
                13
            ],
            "support": [
                305
            ],
            "isAttachmentPreviewEnabled": [
                13
            ],
            "sentry": [
                307
            ],
            "captcha": [
                308
            ],
            "api": [
                310
            ],
            "canManageFeatureFlags": [
                13
            ],
            "publicFeatureFlags": [
                312
            ],
            "isMicrosoftMessagingEnabled": [
                13
            ],
            "isMicrosoftCalendarEnabled": [
                13
            ],
            "isGoogleMessagingEnabled": [
                13
            ],
            "isGoogleCalendarEnabled": [
                13
            ],
            "isConfigVariablesInDbEnabled": [
                13
            ],
            "isImapSmtpCaldavEnabled": [
                13
            ],
            "isManagedEmailEnabled": [
                13
            ],
            "isEmailingDomainInDemoMode": [
                13
            ],
            "allowRequestsToTwentyIcons": [
                13
            ],
            "calendarBookingPageId": [
                1
            ],
            "isCloudflareIntegrationEnabled": [
                13
            ],
            "isClickHouseConfigured": [
                13
            ],
            "isWorkspaceSchemaDDLLocked": [
                13
            ],
            "maintenance": [
                313
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
                7
            ],
            "__typename": [
                1
            ]
        },
        "Impersonate": {
            "loginToken": [
                30
            ],
            "workspace": [
                264
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
                7
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
                317
            ],
            "__typename": [
                1
            ]
        },
        "UsageAnalytics": {
            "usageByUser": [
                315
            ],
            "usageByOperationType": [
                315
            ],
            "usageByModel": [
                315
            ],
            "timeSeries": [
                317
            ],
            "periodStart": [
                4
            ],
            "periodEnd": [
                4
            ],
            "userDailyUsage": [
                318
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
                13
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
                7
            ],
            "lng": [
                7
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
                322
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
                18
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
                11
            ],
            "toolOutput": [
                11
            ],
            "state": [
                1
            ],
            "providerExecuted": [
                13
            ],
            "errorMessage": [
                1
            ],
            "errorDetails": [
                11
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
                11
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
                11
            ],
            "error": [
                1
            ],
            "success": [
                13
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
                11
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
                330
            ],
            "__typename": [
                1
            ]
        },
        "CampaignOutreachAudienceExclusionReason": {},
        "CampaignOutreachAudienceReview": {
            "state": [
                332
            ],
            "campaignId": [
                3
            ],
            "errorCode": [
                1
            ],
            "eligibleCount": [
                18
            ],
            "eligibleCreators": [
                328
            ],
            "excludedCount": [
                18
            ],
            "excludedCreators": [
                329
            ],
            "__typename": [
                1
            ]
        },
        "CampaignOutreachAudienceReviewState": {},
        "CampaignActivityMessageDTO": {
            "id": [
                230
            ],
            "threadId": [
                230
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
                230
            ],
            "creatorId": [
                230
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
                333
            ],
            "latestInbound": [
                333
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
                13
            ],
            "inboxContactId": [
                1
            ],
            "inboxThreadId": [
                230
            ],
            "excluded": [
                13
            ],
            "mayStillSend": [
                13
            ],
            "__typename": [
                1
            ]
        },
        "CampaignActivityPageInfoDTO": {
            "hasNextPage": [
                13
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
                334
            ],
            "pageInfo": [
                335
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
                13
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
                13
            ],
            "changed": [
                13
            ],
            "inFlightCount": [
                18
            ],
            "__typename": [
                1
            ]
        },
        "ChannelSyncSuccess": {
            "success": [
                13
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
                11
            ],
            "indexBy": [
                1
            ],
            "keys": [
                1
            ],
            "series": [
                341
            ],
            "xAxisLabel": [
                1
            ],
            "yAxisLabel": [
                1
            ],
            "showLegend": [
                13
            ],
            "showDataLabels": [
                13
            ],
            "layout": [
                100
            ],
            "groupMode": [
                99
            ],
            "hasTooManyGroups": [
                13
            ],
            "formattedToRawLookup": [
                11
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
                7
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
                343
            ],
            "__typename": [
                1
            ]
        },
        "LineChartData": {
            "series": [
                344
            ],
            "xAxisLabel": [
                1
            ],
            "yAxisLabel": [
                1
            ],
            "showLegend": [
                13
            ],
            "showDataLabels": [
                13
            ],
            "hasTooManyGroups": [
                13
            ],
            "formattedToRawLookup": [
                11
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
                7
            ],
            "__typename": [
                1
            ]
        },
        "PieChartData": {
            "data": [
                346
            ],
            "showLegend": [
                13
            ],
            "showDataLabels": [
                13
            ],
            "showCenterMetric": [
                13
            ],
            "hasTooManyGroups": [
                13
            ],
            "formattedToRawLookup": [
                11
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
                7
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
                13
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
                13
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
                11
            ],
            "recordId": [
                1
            ],
            "objectMetadataId": [
                1
            ],
            "isCustom": [
                13
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
                13
            ],
            "__typename": [
                1
            ]
        },
        "EventLogQueryResult": {
            "records": [
                351
            ],
            "totalCount": [
                18
            ],
            "pageInfo": [
                352
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
                13
            ],
            "isActive": [
                13
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
                324
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
                230
            ],
            "title": [
                1
            ],
            "totalInputTokens": [
                18
            ],
            "totalOutputTokens": [
                18
            ],
            "contextWindowTokens": [
                18
            ],
            "conversationSize": [
                18
            ],
            "totalInputCredits": [
                7
            ],
            "totalOutputCredits": [
                7
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
                18
            ],
            "__typename": [
                1
            ]
        },
        "AiSystemPromptPreview": {
            "sections": [
                357
            ],
            "estimatedTokenCount": [
                18
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
                11
            ],
            "maxSeq": [
                18
            ],
            "error": [
                359
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
                13
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
                11
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
                18
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
                363
            ],
            "messages": [
                355
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
                18
            ],
            "skillsCount": [
                18
            ],
            "toolsCount": [
                18
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
                367
            ],
            "syncStage": [
                368
            ],
            "visibility": [
                369
            ],
            "isContactAutoCreationEnabled": [
                13
            ],
            "contactAutoCreationPolicy": [
                370
            ],
            "isSyncEnabled": [
                13
            ],
            "syncedAt": [
                4
            ],
            "syncStageStartedAt": [
                4
            ],
            "throttleFailureCount": [
                7
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
                13
            ],
            "isSynced": [
                13
            ],
            "parentFolderId": [
                1
            ],
            "externalId": [
                1
            ],
            "pendingSyncAction": [
                372
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
                374
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
                13
            ],
            "isSystem": [
                13
            ],
            "isRemote": [
                13
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
                65
            ],
            "key": [
                66
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
                375
            ],
            "views": [
                376
            ],
            "collectionHashes": [
                373
            ],
            "__typename": [
                1
            ]
        },
        "Query": {
            "getWorkspaceMailboxStatus": [
                297,
                {
                    "connectedAccountId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "navigationMenuItems": [
                182
            ],
            "navigationMenuItem": [
                182,
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
                124
            ],
            "managedEmailOverview": [
                280
            ],
            "managedEmailDomains": [
                281
            ],
            "managedEmailMailboxes": [
                282
            ],
            "managedEmailSubscriptions": [
                293
            ],
            "managedEmailPrewarmedBundles": [
                284
            ],
            "managedEmailProposal": [
                288,
                {
                    "input": [
                        379,
                        "ManagedEmailProposalInput!"
                    ]
                }
            ],
            "managedEmailQuote": [
                290,
                {
                    "input": [
                        381,
                        "ManagedEmailQuoteInput!"
                    ]
                }
            ],
            "managedEmailPrewarmedProposal": [
                288,
                {
                    "input": [
                        382,
                        "ManagedEmailPrewarmedProposalInput!"
                    ]
                }
            ],
            "managedEmailOperation": [
                294,
                {
                    "input": [
                        383,
                        "ManagedEmailOperationInput!"
                    ]
                }
            ],
            "managedEmailHealthDetails": [
                295,
                {
                    "input": [
                        384,
                        "ManagedEmailHealthDetailsInput!"
                    ]
                }
            ],
            "getConnectedImapSmtpCaldavAccount": [
                278,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "applicationConnectionProviders": [
                122,
                {
                    "applicationId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "checkUserExists": [
                274,
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
                275,
                {
                    "inviteHash": [
                        1,
                        "String!"
                    ]
                }
            ],
            "findWorkspaceFromInviteHash": [
                70,
                {
                    "inviteHash": [
                        1,
                        "String!"
                    ]
                }
            ],
            "checkWorkspaceSubdomainAvailability": [
                269,
                {
                    "subdomain": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getWorkspaceCreationDefaults": [
                270
            ],
            "validatePasswordResetToken": [
                267,
                {
                    "passwordResetToken": [
                        1,
                        "String!"
                    ]
                }
            ],
            "managedProviderBillingStatus": [
                156
            ],
            "managedProviderCustomerFundingAction": [
                153,
                {
                    "actionId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "billingPortalSession": [
                146,
                {
                    "returnUrlPath": [
                        1
                    ],
                    "forPaymentMethodUpdate": [
                        13
                    ]
                }
            ],
            "listPlans": [
                144
            ],
            "getResourceCreditUsage": [
                143
            ],
            "appConnections": [
                229,
                {
                    "filter": [
                        385
                    ]
                }
            ],
            "appConnection": [
                229,
                {
                    "id": [
                        230,
                        "ID!"
                    ]
                }
            ],
            "field": [
                41,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "fields": [
                228,
                {
                    "paging": [
                        45,
                        "CursorPaging!"
                    ],
                    "filter": [
                        51,
                        "FieldFilter!"
                    ]
                }
            ],
            "index": [
                43,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "indexMetadatas": [
                197,
                {
                    "paging": [
                        45,
                        "CursorPaging!"
                    ],
                    "filter": [
                        52,
                        "IndexFilter!"
                    ]
                }
            ],
            "getViewGroups": [
                60,
                {
                    "viewId": [
                        1
                    ]
                }
            ],
            "getViewGroup": [
                60,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewFilters": [
                58,
                {
                    "viewId": [
                        1
                    ]
                }
            ],
            "getViewFilter": [
                58,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewFields": [
                54,
                {
                    "viewId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewField": [
                54,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViews": [
                64,
                {
                    "objectMetadataId": [
                        1
                    ],
                    "viewTypes": [
                        65,
                        "[ViewType!]"
                    ]
                }
            ],
            "getView": [
                64,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewSorts": [
                61,
                {
                    "viewId": [
                        1
                    ]
                }
            ],
            "getViewSort": [
                61,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewFieldGroups": [
                63,
                {
                    "viewId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getViewFieldGroup": [
                63,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "objectRecordCounts": [
                200
            ],
            "object": [
                50,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "objects": [
                202,
                {
                    "paging": [
                        45,
                        "CursorPaging!"
                    ],
                    "filter": [
                        47,
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
                        386,
                        "GetApiKeyInput!"
                    ]
                }
            ],
            "currentUser": [
                74
            ],
            "findWorkspaceInvitations": [
                221
            ],
            "getApprovedAccessDomains": [
                219
            ],
            "myConnectedAccounts": [
                163
            ],
            "currentWorkspace": [
                70
            ],
            "getPublicWorkspaceDataByDomain": [
                253,
                {
                    "origin": [
                        1
                    ]
                }
            ],
            "getPublicWorkspaceDataById": [
                254,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getViewFilterGroups": [
                56,
                {
                    "viewId": [
                        1
                    ]
                }
            ],
            "getViewFilterGroup": [
                56,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "campaignInfluencerSnapshot": [
                214,
                {
                    "input": [
                        387,
                        "CampaignInfluencerCampaignInput!"
                    ]
                }
            ],
            "campaignCreatorListRemovalImpact": [
                215,
                {
                    "input": [
                        388,
                        "CampaignCreatorListRemovalImpactInput!"
                    ]
                }
            ],
            "campaignCreatorListAdditionCandidates": [
                216,
                {
                    "input": [
                        389,
                        "CampaignCreatorListAdditionCandidatesInput!"
                    ]
                }
            ],
            "creatorListMembershipRemovalImpact": [
                218,
                {
                    "input": [
                        390,
                        "CreatorListMembershipIntentInput!"
                    ]
                }
            ],
            "campaignEmailAccounts": [
                210,
                {
                    "input": [
                        391,
                        "CampaignEmailAccountCampaignInput!"
                    ]
                }
            ],
            "campaignEmailAccountCandidates": [
                210,
                {
                    "input": [
                        391,
                        "CampaignEmailAccountCampaignInput!"
                    ]
                }
            ],
            "campaignEmailSenderPool": [
                207,
                {
                    "input": [
                        391,
                        "CampaignEmailAccountCampaignInput!"
                    ]
                }
            ],
            "exactCampaignEmailSender": [
                208,
                {
                    "input": [
                        392,
                        "ResolveExactCampaignEmailSenderInput!"
                    ]
                }
            ],
            "previewMessageCampaignAudience": [
                173,
                {
                    "input": [
                        393,
                        "PreviewMessageCampaignAudienceInput!"
                    ]
                }
            ],
            "unsubscribeTopics": [
                177
            ],
            "unsubscribePagePreviewUrl": [
                1
            ],
            "myMessageChannels": [
                164,
                {
                    "connectedAccountId": [
                        3
                    ]
                }
            ],
            "getEmailingDomains": [
                158
            ],
            "commandMenuItems": [
                33
            ],
            "commandMenuItem": [
                33,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "frontComponents": [
                32
            ],
            "frontComponent": [
                32,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "findOneLogicFunction": [
                39,
                {
                    "input": [
                        394,
                        "LogicFunctionIdInput!"
                    ]
                }
            ],
            "findManyLogicFunctions": [
                39
            ],
            "getAvailablePackages": [
                11,
                {
                    "input": [
                        394,
                        "LogicFunctionIdInput!"
                    ]
                }
            ],
            "getLogicFunctionSourceCode": [
                1,
                {
                    "input": [
                        394,
                        "LogicFunctionIdInput!"
                    ]
                }
            ],
            "getPageLayoutTabs": [
                118,
                {
                    "pageLayoutId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getPageLayoutTab": [
                118,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getPageLayouts": [
                119,
                {
                    "objectMetadataId": [
                        1
                    ],
                    "pageLayoutType": [
                        120
                    ]
                }
            ],
            "getPageLayout": [
                119,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "findManyAgents": [
                22
            ],
            "findOneAgent": [
                22,
                {
                    "input": [
                        395,
                        "AgentIdInput!"
                    ]
                }
            ],
            "getRoles": [
                26
            ],
            "getSSOIdentityProviders": [
                237
            ],
            "getPageLayoutWidgets": [
                80,
                {
                    "pageLayoutTabId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getPageLayoutWidget": [
                80,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "getToolIndex": [
                327
            ],
            "getToolInputSchema": [
                11,
                {
                    "toolName": [
                        1,
                        "String!"
                    ]
                }
            ],
            "webhooks": [
                326
            ],
            "webhook": [
                326,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getActionApprovalProposal": [
                224,
                {
                    "bindingId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getActionExecutionReceipt": [
                225,
                {
                    "bindingId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "myMessageFolders": [
                371,
                {
                    "messageChannelId": [
                        3
                    ]
                }
            ],
            "myCalendarChannels": [
                366,
                {
                    "connectedAccountId": [
                        3
                    ]
                }
            ],
            "minimalMetadata": [
                377
            ],
            "findWorkspaceAiStats": [
                365
            ],
            "chatThreads": [
                356
            ],
            "chatThread": [
                356,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "chatMessages": [
                355,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "chatStreamCatchupChunks": [
                360,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getAiSystemPromptPreview": [
                358
            ],
            "skills": [
                354
            ],
            "skill": [
                354,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "agentTurns": [
                364,
                {
                    "agentId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "eventLogs": [
                353,
                {
                    "input": [
                        396,
                        "EventLogQueryInput!"
                    ]
                }
            ],
            "pieChartData": [
                347,
                {
                    "input": [
                        400,
                        "PieChartDataInput!"
                    ]
                }
            ],
            "lineChartData": [
                345,
                {
                    "input": [
                        401,
                        "LineChartDataInput!"
                    ]
                }
            ],
            "barChartData": [
                342,
                {
                    "input": [
                        402,
                        "BarChartDataInput!"
                    ]
                }
            ],
            "campaignActivity": [
                336,
                {
                    "input": [
                        403,
                        "CampaignActivityInput!"
                    ]
                }
            ],
            "campaignOutreachAudienceReview": [
                331,
                {
                    "campaignId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "getAutoCompleteAddress": [
                321,
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
                        13
                    ]
                }
            ],
            "getAddressDetails": [
                323,
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
                319,
                {
                    "input": [
                        404
                    ]
                }
            ],
            "findManyPublicDomains": [
                320
            ],
            "__typename": [
                1
            ]
        },
        "ManagedEmailProposalInput": {
            "mailboxCount": [
                18
            ],
            "personas": [
                380
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
                230
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
                397
            ],
            "filters": [
                398
            ],
            "first": [
                18
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
                399
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
                11
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
                11
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
                11
            ],
            "__typename": [
                1
            ]
        },
        "CampaignActivityInput": {
            "campaignId": [
                230
            ],
            "first": [
                18
            ],
            "after": [
                1
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
                405
            ],
            "__typename": [
                1
            ]
        },
        "UsageOperationType": {},
        "Mutation": {
            "connectWorkspaceMailbox": [
                298,
                {
                    "input": [
                        407,
                        "ConnectWorkspaceMailboxInput!"
                    ]
                }
            ],
            "rotateWorkspaceMailbox": [
                298,
                {
                    "input": [
                        410,
                        "ReplaceWorkspaceMailboxCredentialsInput!"
                    ]
                }
            ],
            "reconnectWorkspaceMailbox": [
                298,
                {
                    "input": [
                        410,
                        "ReplaceWorkspaceMailboxCredentialsInput!"
                    ]
                }
            ],
            "revokeWorkspaceMailbox": [
                299,
                {
                    "connectedAccountId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "addQueryToEventStream": [
                13,
                {
                    "input": [
                        411,
                        "AddQuerySubscriptionInput!"
                    ]
                }
            ],
            "removeQueryFromEventStream": [
                13,
                {
                    "input": [
                        412,
                        "RemoveQueryFromEventStreamInput!"
                    ]
                }
            ],
            "createManyNavigationMenuItems": [
                182,
                {
                    "inputs": [
                        413,
                        "[CreateNavigationMenuItemInput!]!"
                    ]
                }
            ],
            "createNavigationMenuItem": [
                182,
                {
                    "input": [
                        413,
                        "CreateNavigationMenuItemInput!"
                    ]
                }
            ],
            "updateManyNavigationMenuItems": [
                182,
                {
                    "inputs": [
                        414,
                        "[UpdateOneNavigationMenuItemInput!]!"
                    ]
                }
            ],
            "updateNavigationMenuItem": [
                182,
                {
                    "input": [
                        414,
                        "UpdateOneNavigationMenuItemInput!"
                    ]
                }
            ],
            "deleteManyNavigationMenuItems": [
                182,
                {
                    "ids": [
                        3,
                        "[UUID!]!"
                    ]
                }
            ],
            "deleteNavigationMenuItem": [
                182,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createFileUpload": [
                180,
                {
                    "filename": [
                        1,
                        "String!"
                    ],
                    "size": [
                        7,
                        "Float!"
                    ],
                    "fileFolder": [
                        416,
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
                179,
                {
                    "fileId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "refreshEnterpriseValidityToken": [
                13
            ],
            "setEnterpriseKey": [
                123,
                {
                    "enterpriseKey": [
                        1,
                        "String!"
                    ]
                }
            ],
            "uploadEmailAttachmentFile": [
                179,
                {
                    "file": [
                        417,
                        "Upload!"
                    ]
                }
            ],
            "uploadAiChatFile": [
                179,
                {
                    "file": [
                        417,
                        "Upload!"
                    ]
                }
            ],
            "uploadWorkflowFile": [
                179,
                {
                    "file": [
                        417,
                        "Upload!"
                    ]
                }
            ],
            "uploadWorkspaceLogo": [
                179,
                {
                    "file": [
                        417,
                        "Upload!"
                    ]
                }
            ],
            "uploadWorkspaceMemberProfilePicture": [
                179,
                {
                    "file": [
                        417,
                        "Upload!"
                    ]
                }
            ],
            "uploadFilesFieldFile": [
                179,
                {
                    "file": [
                        417,
                        "Upload!"
                    ],
                    "fieldMetadataId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "uploadFilesFieldFileByUniversalIdentifier": [
                179,
                {
                    "file": [
                        417,
                        "Upload!"
                    ],
                    "fieldMetadataUniversalIdentifier": [
                        1,
                        "String!"
                    ]
                }
            ],
            "prepareManagedEmailPaymentMethod": [
                291
            ],
            "completeManagedEmailPaymentMethod": [
                292,
                {
                    "input": [
                        418,
                        "ManagedEmailCompletePaymentMethodInput!"
                    ]
                }
            ],
            "confirmManagedEmailPrewarmedPurchase": [
                296,
                {
                    "input": [
                        419,
                        "ManagedEmailPurchaseInput!"
                    ]
                }
            ],
            "confirmManagedEmailOrdinaryPurchase": [
                296,
                {
                    "input": [
                        419,
                        "ManagedEmailPurchaseInput!"
                    ]
                }
            ],
            "setManagedEmailCampaignCap": [
                296,
                {
                    "input": [
                        420,
                        "ManagedEmailCampaignCapInput!"
                    ]
                }
            ],
            "cancelManagedEmailWarmup": [
                296,
                {
                    "input": [
                        421,
                        "ManagedEmailMailboxActionInput!"
                    ]
                }
            ],
            "pauseManagedEmailWarmup": [
                296,
                {
                    "input": [
                        421,
                        "ManagedEmailMailboxActionInput!"
                    ]
                }
            ],
            "resumeManagedEmailWarmup": [
                296,
                {
                    "input": [
                        421,
                        "ManagedEmailMailboxActionInput!"
                    ]
                }
            ],
            "stopManagedEmailMailbox": [
                296,
                {
                    "input": [
                        421,
                        "ManagedEmailMailboxActionInput!"
                    ]
                }
            ],
            "cancelManagedEmailDomainRenewal": [
                296,
                {
                    "input": [
                        422,
                        "ManagedEmailDomainActionInput!"
                    ]
                }
            ],
            "saveImapSmtpCaldavAccount": [
                279,
                {
                    "handle": [
                        1,
                        "String!"
                    ],
                    "connectionParameters": [
                        423,
                        "EmailAccountConnectionParameters!"
                    ],
                    "id": [
                        3
                    ]
                }
            ],
            "getAuthorizationUrlForSSO": [
                262,
                {
                    "input": [
                        425,
                        "GetAuthorizationUrlForSSOInput!"
                    ]
                }
            ],
            "getLoginTokenFromCredentials": [
                273,
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
                260,
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
                268,
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
                260,
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
                272,
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
                260,
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
                265,
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
                265,
                {
                    "input": [
                        426
                    ]
                }
            ],
            "uploadNewWorkspaceLogo": [
                179,
                {
                    "workspaceId": [
                        1,
                        "String!"
                    ],
                    "file": [
                        417,
                        "Upload!"
                    ]
                }
            ],
            "generateTransientToken": [
                266
            ],
            "getAuthTokensFromLoginToken": [
                272,
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
            "renewToken": [
                272,
                {
                    "appToken": [
                        1,
                        "String!"
                    ]
                }
            ],
            "generateApiKeyToken": [
                271,
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
                30
            ],
            "emailPasswordResetLink": [
                261,
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
                263,
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
                153,
                {
                    "principalCents": [
                        18,
                        "Int!"
                    ],
                    "idempotencyKey": [
                        1,
                        "String!"
                    ]
                }
            ],
            "prepareManagedProviderCustomerFundingPaymentMethod": [
                154,
                {
                    "replaceExistingPaymentMethod": [
                        13
                    ]
                }
            ],
            "completeManagedProviderCustomerFundingPaymentMethod": [
                154,
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
                155,
                {
                    "actionId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "acknowledgeManagedProviderCustomerFundingPaymentAction": [
                153,
                {
                    "actionId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "checkoutSession": [
                146,
                {
                    "recurringInterval": [
                        132,
                        "SubscriptionInterval!"
                    ],
                    "plan": [
                        128,
                        "BillingPlanKey!"
                    ],
                    "requirePaymentMethod": [
                        13,
                        "Boolean!"
                    ],
                    "successUrlPath": [
                        1
                    ]
                }
            ],
            "createSubscriptionPaymentIntent": [
                145,
                {
                    "recurringInterval": [
                        132,
                        "SubscriptionInterval!"
                    ],
                    "plan": [
                        128,
                        "BillingPlanKey!"
                    ],
                    "requirePaymentMethod": [
                        13,
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
                145
            ],
            "switchSubscriptionInterval": [
                147
            ],
            "switchBillingPlan": [
                147
            ],
            "cancelSwitchBillingPlan": [
                147
            ],
            "cancelSwitchBillingInterval": [
                147
            ],
            "setResourceCreditSubscriptionPrice": [
                147,
                {
                    "priceId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "endSubscriptionTrialPeriod": [
                142
            ],
            "cancelSwitchResourceCreditPrice": [
                147
            ],
            "createOneField": [
                41,
                {
                    "input": [
                        427,
                        "CreateOneFieldMetadataInput!"
                    ]
                }
            ],
            "updateOneField": [
                41,
                {
                    "input": [
                        429,
                        "UpdateOneFieldMetadataInput!"
                    ]
                }
            ],
            "deleteOneField": [
                41,
                {
                    "input": [
                        431,
                        "DeleteOneFieldInput!"
                    ]
                }
            ],
            "createOneIndex": [
                43,
                {
                    "input": [
                        432,
                        "CreateOneIndexInput!"
                    ]
                }
            ],
            "deleteOneIndex": [
                43,
                {
                    "input": [
                        435,
                        "DeleteOneIndexInput!"
                    ]
                }
            ],
            "createViewGroup": [
                60,
                {
                    "input": [
                        436,
                        "CreateViewGroupInput!"
                    ]
                }
            ],
            "createManyViewGroups": [
                60,
                {
                    "inputs": [
                        436,
                        "[CreateViewGroupInput!]!"
                    ]
                }
            ],
            "updateViewGroup": [
                60,
                {
                    "input": [
                        437,
                        "UpdateViewGroupInput!"
                    ]
                }
            ],
            "updateManyViewGroups": [
                60,
                {
                    "inputs": [
                        437,
                        "[UpdateViewGroupInput!]!"
                    ]
                }
            ],
            "deleteViewGroup": [
                60,
                {
                    "input": [
                        439,
                        "DeleteViewGroupInput!"
                    ]
                }
            ],
            "destroyViewGroup": [
                60,
                {
                    "input": [
                        440,
                        "DestroyViewGroupInput!"
                    ]
                }
            ],
            "createViewFilter": [
                58,
                {
                    "input": [
                        441,
                        "CreateViewFilterInput!"
                    ]
                }
            ],
            "updateViewFilter": [
                58,
                {
                    "input": [
                        442,
                        "UpdateViewFilterInput!"
                    ]
                }
            ],
            "deleteViewFilter": [
                58,
                {
                    "input": [
                        444,
                        "DeleteViewFilterInput!"
                    ]
                }
            ],
            "destroyViewFilter": [
                58,
                {
                    "input": [
                        445,
                        "DestroyViewFilterInput!"
                    ]
                }
            ],
            "updateViewField": [
                54,
                {
                    "input": [
                        446,
                        "UpdateViewFieldInput!"
                    ]
                }
            ],
            "createViewField": [
                54,
                {
                    "input": [
                        448,
                        "CreateViewFieldInput!"
                    ]
                }
            ],
            "createManyViewFields": [
                54,
                {
                    "inputs": [
                        448,
                        "[CreateViewFieldInput!]!"
                    ]
                }
            ],
            "deleteViewField": [
                54,
                {
                    "input": [
                        449,
                        "DeleteViewFieldInput!"
                    ]
                }
            ],
            "destroyViewField": [
                54,
                {
                    "input": [
                        450,
                        "DestroyViewFieldInput!"
                    ]
                }
            ],
            "createView": [
                64,
                {
                    "input": [
                        451,
                        "CreateViewInput!"
                    ]
                }
            ],
            "updateView": [
                64,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        452,
                        "UpdateViewInput!"
                    ]
                }
            ],
            "deleteView": [
                13,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "destroyView": [
                13,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "upsertViewWidget": [
                64,
                {
                    "input": [
                        453,
                        "UpsertViewWidgetInput!"
                    ]
                }
            ],
            "createViewSort": [
                61,
                {
                    "input": [
                        458,
                        "CreateViewSortInput!"
                    ]
                }
            ],
            "updateViewSort": [
                61,
                {
                    "input": [
                        459,
                        "UpdateViewSortInput!"
                    ]
                }
            ],
            "deleteViewSort": [
                13,
                {
                    "input": [
                        461,
                        "DeleteViewSortInput!"
                    ]
                }
            ],
            "destroyViewSort": [
                13,
                {
                    "input": [
                        462,
                        "DestroyViewSortInput!"
                    ]
                }
            ],
            "updateViewFieldGroup": [
                63,
                {
                    "input": [
                        463,
                        "UpdateViewFieldGroupInput!"
                    ]
                }
            ],
            "createViewFieldGroup": [
                63,
                {
                    "input": [
                        465,
                        "CreateViewFieldGroupInput!"
                    ]
                }
            ],
            "createManyViewFieldGroups": [
                63,
                {
                    "inputs": [
                        465,
                        "[CreateViewFieldGroupInput!]!"
                    ]
                }
            ],
            "deleteViewFieldGroup": [
                63,
                {
                    "input": [
                        466,
                        "DeleteViewFieldGroupInput!"
                    ]
                }
            ],
            "destroyViewFieldGroup": [
                63,
                {
                    "input": [
                        467,
                        "DestroyViewFieldGroupInput!"
                    ]
                }
            ],
            "upsertFieldsWidget": [
                64,
                {
                    "input": [
                        468,
                        "UpsertFieldsWidgetInput!"
                    ]
                }
            ],
            "createOneObject": [
                50,
                {
                    "input": [
                        471,
                        "CreateOneObjectInput!"
                    ]
                }
            ],
            "deleteOneObject": [
                50,
                {
                    "input": [
                        473,
                        "DeleteOneObjectInput!"
                    ]
                }
            ],
            "updateOneObject": [
                50,
                {
                    "input": [
                        474,
                        "UpdateOneObjectInput!"
                    ]
                }
            ],
            "createApiKey": [
                2,
                {
                    "input": [
                        476,
                        "CreateApiKeyInput!"
                    ]
                }
            ],
            "updateApiKey": [
                2,
                {
                    "input": [
                        477,
                        "UpdateApiKeyInput!"
                    ]
                }
            ],
            "revokeApiKey": [
                2,
                {
                    "input": [
                        478,
                        "RevokeApiKeyInput!"
                    ]
                }
            ],
            "assignRoleToApiKey": [
                13,
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
                257,
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
                257
            ],
            "deleteTwoFactorAuthenticationMethod": [
                256,
                {
                    "twoFactorAuthenticationMethodId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "verifyTwoFactorAuthenticationMethodForAuthenticatedUser": [
                258,
                {
                    "otp": [
                        1,
                        "String!"
                    ]
                }
            ],
            "deleteUser": [
                74
            ],
            "deleteUserFromWorkspace": [
                14,
                {
                    "workspaceMemberIdToDelete": [
                        1,
                        "String!"
                    ]
                }
            ],
            "updateWorkspaceMemberSettings": [
                13,
                {
                    "input": [
                        479,
                        "UpdateWorkspaceMemberSettingsInput!"
                    ]
                }
            ],
            "updateUserEmail": [
                13,
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
                231,
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
                220
            ],
            "skipBookOnboardingStep": [
                220
            ],
            "triggerInstallAppsOnboardingStep": [
                220,
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
                222,
                {
                    "appTokenId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "sendInvitations": [
                222,
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
                219,
                {
                    "input": [
                        480,
                        "CreateApprovedAccessDomainInput!"
                    ]
                }
            ],
            "deleteApprovedAccessDomain": [
                13,
                {
                    "input": [
                        481,
                        "DeleteApprovedAccessDomainInput!"
                    ]
                }
            ],
            "validateApprovedAccessDomain": [
                219,
                {
                    "input": [
                        482,
                        "ValidateApprovedAccessDomainInput!"
                    ]
                }
            ],
            "updateConnectedAccountSendingPolicy": [
                163,
                {
                    "input": [
                        483,
                        "UpdateConnectedAccountSendingPolicyInput!"
                    ]
                }
            ],
            "deleteConnectedAccount": [
                163,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "activateWorkspace": [
                70,
                {
                    "data": [
                        484,
                        "ActivateWorkspaceInput!"
                    ]
                }
            ],
            "updateWorkspace": [
                70,
                {
                    "data": [
                        485,
                        "UpdateWorkspaceInput!"
                    ]
                }
            ],
            "deleteCurrentWorkspace": [
                70
            ],
            "checkCustomDomainValidRecords": [
                247
            ],
            "createViewFilterGroup": [
                56,
                {
                    "input": [
                        486,
                        "CreateViewFilterGroupInput!"
                    ]
                }
            ],
            "updateViewFilterGroup": [
                56,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        487,
                        "UpdateViewFilterGroupInput!"
                    ]
                }
            ],
            "deleteViewFilterGroup": [
                13,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "destroyViewFilterGroup": [
                13,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "attachCampaignCreatorLists": [
                214,
                {
                    "input": [
                        488,
                        "AttachCampaignCreatorListsInput!"
                    ]
                }
            ],
            "addDirectCampaignCreators": [
                214,
                {
                    "input": [
                        489,
                        "AddDirectCampaignCreatorsInput!"
                    ]
                }
            ],
            "approveCampaignCreatorListAdditions": [
                13,
                {
                    "input": [
                        490,
                        "ApproveCampaignCreatorListAdditionsInput!"
                    ]
                }
            ],
            "detachCampaignCreatorList": [
                214,
                {
                    "input": [
                        491,
                        "DetachCampaignCreatorListInput!"
                    ]
                }
            ],
            "addCreatorListMemberIntent": [
                217,
                {
                    "input": [
                        390,
                        "CreatorListMembershipIntentInput!"
                    ]
                }
            ],
            "addCreatorListMembersIntent": [
                217,
                {
                    "input": [
                        492,
                        "CreatorListMembersIntentInput!"
                    ]
                }
            ],
            "removeCreatorListMemberIntent": [
                13,
                {
                    "input": [
                        493,
                        "RemoveCreatorListMemberIntentInput!"
                    ]
                }
            ],
            "replaceCampaignEmailPool": [
                207,
                {
                    "input": [
                        494,
                        "ReplaceCampaignEmailPoolInput!"
                    ]
                }
            ],
            "linkCampaignEmailAccount": [
                210,
                {
                    "input": [
                        495,
                        "LinkCampaignEmailAccountInput!"
                    ]
                }
            ],
            "setDefaultCampaignEmailAccount": [
                210,
                {
                    "input": [
                        496,
                        "CampaignEmailAccountLinkInput!"
                    ]
                }
            ],
            "removeCampaignEmailAccount": [
                210,
                {
                    "input": [
                        496,
                        "CampaignEmailAccountLinkInput!"
                    ]
                }
            ],
            "sendEmailViaEmailingDomain": [
                174,
                {
                    "input": [
                        497,
                        "SendEmailViaDomainInput!"
                    ]
                }
            ],
            "sendMessageCampaign": [
                176,
                {
                    "input": [
                        498,
                        "SendMessageCampaignInput!"
                    ]
                }
            ],
            "createUnsubscribeTopic": [
                177,
                {
                    "input": [
                        499,
                        "CreateUnsubscribeTopicInput!"
                    ]
                }
            ],
            "updateUnsubscribeTopic": [
                177,
                {
                    "input": [
                        500,
                        "UpdateUnsubscribeTopicInput!"
                    ]
                }
            ],
            "deleteUnsubscribeTopic": [
                13,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "updateMessageChannel": [
                164,
                {
                    "input": [
                        501,
                        "UpdateMessageChannelInput!"
                    ]
                }
            ],
            "createEmailGroupChannel": [
                172,
                {
                    "input": [
                        503,
                        "CreateEmailGroupChannelInput!"
                    ]
                }
            ],
            "deleteEmailGroupChannel": [
                164,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createEmailingDomain": [
                158,
                {
                    "input": [
                        504,
                        "CreateEmailingDomainInput!"
                    ]
                }
            ],
            "deleteEmailingDomain": [
                13,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "verifyEmailingDomain": [
                158,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createCommandMenuItem": [
                33,
                {
                    "input": [
                        505,
                        "CreateCommandMenuItemInput!"
                    ]
                }
            ],
            "updateCommandMenuItem": [
                33,
                {
                    "input": [
                        506,
                        "UpdateCommandMenuItemInput!"
                    ]
                }
            ],
            "resetCommandMenuItem": [
                33,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "deleteCommandMenuItem": [
                33,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createFrontComponent": [
                32,
                {
                    "input": [
                        507,
                        "CreateFrontComponentInput!"
                    ]
                }
            ],
            "updateFrontComponent": [
                32,
                {
                    "input": [
                        508,
                        "UpdateFrontComponentInput!"
                    ]
                }
            ],
            "deleteFrontComponent": [
                32,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "deleteOneLogicFunction": [
                39,
                {
                    "input": [
                        394,
                        "LogicFunctionIdInput!"
                    ]
                }
            ],
            "createOneLogicFunction": [
                39,
                {
                    "input": [
                        510,
                        "CreateLogicFunctionFromSourceInput!"
                    ]
                }
            ],
            "executeOneLogicFunction": [
                191,
                {
                    "input": [
                        511,
                        "ExecuteOneLogicFunctionInput!"
                    ]
                }
            ],
            "updateOneLogicFunction": [
                13,
                {
                    "input": [
                        512,
                        "UpdateLogicFunctionFromSourceInput!"
                    ]
                }
            ],
            "createPageLayoutTab": [
                118,
                {
                    "input": [
                        514,
                        "CreatePageLayoutTabInput!"
                    ]
                }
            ],
            "updatePageLayoutTab": [
                118,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        515,
                        "UpdatePageLayoutTabInput!"
                    ]
                }
            ],
            "destroyPageLayoutTab": [
                13,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createPageLayout": [
                119,
                {
                    "input": [
                        516,
                        "CreatePageLayoutInput!"
                    ]
                }
            ],
            "updatePageLayout": [
                119,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        517,
                        "UpdatePageLayoutInput!"
                    ]
                }
            ],
            "destroyPageLayout": [
                13,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "updatePageLayoutWithTabsAndWidgets": [
                119,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        518,
                        "UpdatePageLayoutWithTabsInput!"
                    ]
                }
            ],
            "resetPageLayoutToDefault": [
                119,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "resetPageLayoutWidgetToDefault": [
                80,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "resetPageLayoutTabToDefault": [
                118,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createOneAgent": [
                22,
                {
                    "input": [
                        522,
                        "CreateAgentInput!"
                    ]
                }
            ],
            "updateOneAgent": [
                22,
                {
                    "input": [
                        523,
                        "UpdateAgentInput!"
                    ]
                }
            ],
            "deleteOneAgent": [
                22,
                {
                    "input": [
                        395,
                        "AgentIdInput!"
                    ]
                }
            ],
            "updateWorkspaceMemberRole": [
                17,
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
                26,
                {
                    "createRoleInput": [
                        524,
                        "CreateRoleInput!"
                    ]
                }
            ],
            "updateOneRole": [
                26,
                {
                    "updateRoleInput": [
                        525,
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
                12,
                {
                    "upsertObjectPermissionsInput": [
                        527,
                        "UpsertObjectPermissionsInput!"
                    ]
                }
            ],
            "upsertPermissionFlags": [
                24,
                {
                    "upsertPermissionFlagsInput": [
                        529,
                        "UpsertPermissionFlagsInput!"
                    ]
                }
            ],
            "upsertFieldPermissions": [
                23,
                {
                    "upsertFieldPermissionsInput": [
                        530,
                        "UpsertFieldPermissionsInput!"
                    ]
                }
            ],
            "upsertRowLevelPermissionPredicates": [
                255,
                {
                    "input": [
                        532,
                        "UpsertRowLevelPermissionPredicatesInput!"
                    ]
                }
            ],
            "assignRoleToAgent": [
                13,
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
                13,
                {
                    "agentId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createOIDCIdentityProvider": [
                238,
                {
                    "input": [
                        535,
                        "SetupOIDCSsoInput!"
                    ]
                }
            ],
            "createSAMLIdentityProvider": [
                238,
                {
                    "input": [
                        536,
                        "SetupSAMLSsoInput!"
                    ]
                }
            ],
            "deleteSSOIdentityProvider": [
                232,
                {
                    "input": [
                        537,
                        "DeleteSsoInput!"
                    ]
                }
            ],
            "editSSOIdentityProvider": [
                233,
                {
                    "input": [
                        538,
                        "EditSsoInput!"
                    ]
                }
            ],
            "createPageLayoutWidget": [
                80,
                {
                    "input": [
                        539,
                        "CreatePageLayoutWidgetInput!"
                    ]
                }
            ],
            "updatePageLayoutWidget": [
                80,
                {
                    "id": [
                        1,
                        "String!"
                    ],
                    "input": [
                        540,
                        "UpdatePageLayoutWidgetInput!"
                    ]
                }
            ],
            "destroyPageLayoutWidget": [
                13,
                {
                    "id": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createWebhook": [
                326,
                {
                    "input": [
                        541,
                        "CreateWebhookInput!"
                    ]
                }
            ],
            "updateWebhook": [
                326,
                {
                    "input": [
                        542,
                        "UpdateWebhookInput!"
                    ]
                }
            ],
            "deleteWebhook": [
                326,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "runAgent": [
                325,
                {
                    "input": [
                        544,
                        "RunAgentInput!"
                    ]
                }
            ],
            "updateMessageFolder": [
                371,
                {
                    "input": [
                        545,
                        "UpdateMessageFolderInput!"
                    ]
                }
            ],
            "updateMessageFolders": [
                371,
                {
                    "input": [
                        547,
                        "UpdateMessageFoldersInput!"
                    ]
                }
            ],
            "createChatThread": [
                356
            ],
            "sendChatMessage": [
                361,
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
                        11
                    ],
                    "modelId": [
                        1
                    ],
                    "fileAttachments": [
                        548,
                        "[FileAttachmentInput!]"
                    ]
                }
            ],
            "retryChatMessage": [
                361,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ],
                    "browsingContext": [
                        11
                    ],
                    "modelId": [
                        1
                    ]
                }
            ],
            "answerAgentChatQuestion": [
                361,
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
                        549,
                        "[AgentChatQuestionAnswerInput!]!"
                    ],
                    "modelId": [
                        1
                    ]
                }
            ],
            "resolveAgentChatApproval": [
                361,
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
                        550,
                        "AgentChatApprovalDecisionInput!"
                    ],
                    "modelId": [
                        1
                    ]
                }
            ],
            "stopAgentChatStream": [
                13,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "renameChatThread": [
                356,
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
                356,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "unarchiveChatThread": [
                356,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "deleteChatThread": [
                13,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "deleteQueuedChatMessage": [
                13,
                {
                    "messageId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "createSkill": [
                354,
                {
                    "input": [
                        551,
                        "CreateSkillInput!"
                    ]
                }
            ],
            "updateSkill": [
                354,
                {
                    "input": [
                        552,
                        "UpdateSkillInput!"
                    ]
                }
            ],
            "deleteSkill": [
                354,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "activateSkill": [
                354,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "deactivateSkill": [
                354,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "evaluateAgentTurn": [
                363,
                {
                    "turnId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "runEvaluationInput": [
                364,
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
                350,
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
                        11
                    ]
                }
            ],
            "trackAnalytics": [
                350,
                {
                    "type": [
                        553,
                        "AnalyticsType!"
                    ],
                    "name": [
                        1
                    ],
                    "event": [
                        1
                    ],
                    "properties": [
                        11
                    ]
                }
            ],
            "duplicateDashboard": [
                348,
                {
                    "id": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "impersonate": [
                316,
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
                337,
                {
                    "input": [
                        554,
                        "ExcludeCampaignCreatorInput!"
                    ]
                }
            ],
            "startCampaignExecution": [
                339,
                {
                    "input": [
                        555,
                        "StartCampaignExecutionInput!"
                    ]
                }
            ],
            "updateCampaignSendingWindow": [
                338,
                {
                    "input": [
                        556,
                        "UpdateCampaignSendingWindowInput!"
                    ]
                }
            ],
            "stopCampaignExecution": [
                339,
                {
                    "input": [
                        557,
                        "StopCampaignExecutionInput!"
                    ]
                }
            ],
            "sendEmail": [
                349,
                {
                    "input": [
                        558,
                        "SendEmailInput!"
                    ]
                }
            ],
            "startChannelSync": [
                340,
                {
                    "connectedAccountId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "updateLabPublicFeatureFlag": [
                248,
                {
                    "input": [
                        560,
                        "UpdateLabPublicFeatureFlagInput!"
                    ]
                }
            ],
            "createPublicDomain": [
                320,
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
                13,
                {
                    "domain": [
                        1,
                        "String!"
                    ]
                }
            ],
            "checkPublicDomainValidRecords": [
                247,
                {
                    "domain": [
                        1,
                        "String!"
                    ]
                }
            ],
            "createOneAppToken": [
                73,
                {
                    "input": [
                        561,
                        "CreateOneAppTokenInput!"
                    ]
                }
            ],
            "renewApplicationToken": [
                31,
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
                408
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
                409
            ],
            "SMTP": [
                409
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
                7
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
                408
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
                11
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
                183
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
                7
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
                415
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
                7
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
                18
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
                424
            ],
            "SMTP": [
                424
            ],
            "CALDAV": [
                424
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
                7
            ],
            "username": [
                1
            ],
            "password": [
                1
            ],
            "connectionSecurity": [
                161
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
        "CreateOneFieldMetadataInput": {
            "field": [
                428
            ],
            "__typename": [
                1
            ]
        },
        "CreateFieldInput": {
            "type": [
                42
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
                13
            ],
            "isSystem": [
                13
            ],
            "isUIEditable": [
                13
            ],
            "isUIReadOnly": [
                13
            ],
            "isNullable": [
                13
            ],
            "isUnique": [
                13
            ],
            "defaultValue": [
                11
            ],
            "options": [
                11
            ],
            "settings": [
                11
            ],
            "objectMetadataId": [
                3
            ],
            "isLabelSyncedWithName": [
                13
            ],
            "isRemoteCreation": [
                13
            ],
            "relationCreationPayload": [
                11
            ],
            "morphRelationsCreationPayload": [
                11
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
                430
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
                13
            ],
            "isSystem": [
                13
            ],
            "isUIEditable": [
                13
            ],
            "isUIReadOnly": [
                13
            ],
            "isNullable": [
                13
            ],
            "isUnique": [
                13
            ],
            "defaultValue": [
                11
            ],
            "options": [
                11
            ],
            "settings": [
                11
            ],
            "objectMetadataId": [
                3
            ],
            "isLabelSyncedWithName": [
                13
            ],
            "morphRelationsUpdatePayload": [
                11
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
                433
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
                434
            ],
            "indexType": [
                44
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
                13
            ],
            "fieldValue": [
                1
            ],
            "position": [
                7
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
                438
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
                13
            ],
            "fieldValue": [
                1
            ],
            "position": [
                7
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
                59
            ],
            "value": [
                11
            ],
            "viewFilterGroupId": [
                3
            ],
            "positionInViewFilterGroup": [
                7
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
                443
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
                59
            ],
            "value": [
                11
            ],
            "viewFilterGroupId": [
                3
            ],
            "positionInViewFilterGroup": [
                7
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
                447
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewFieldInputUpdates": {
            "isVisible": [
                13
            ],
            "size": [
                7
            ],
            "position": [
                7
            ],
            "aggregateOperation": [
                55
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
                13
            ],
            "size": [
                7
            ],
            "position": [
                7
            ],
            "aggregateOperation": [
                55
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
                65
            ],
            "key": [
                66
            ],
            "icon": [
                1
            ],
            "position": [
                7
            ],
            "isCompact": [
                13
            ],
            "shouldHideEmptyGroups": [
                13
            ],
            "kanbanColumnWidth": [
                18
            ],
            "openRecordIn": [
                67
            ],
            "kanbanAggregateOperation": [
                55
            ],
            "kanbanAggregateOperationFieldMetadataId": [
                3
            ],
            "anyFieldFilterValue": [
                1
            ],
            "calendarLayout": [
                68
            ],
            "calendarFieldMetadataId": [
                3
            ],
            "mainGroupByFieldMetadataId": [
                3
            ],
            "visibility": [
                69
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
                65
            ],
            "icon": [
                1
            ],
            "position": [
                7
            ],
            "isCompact": [
                13
            ],
            "openRecordIn": [
                67
            ],
            "kanbanAggregateOperation": [
                55
            ],
            "kanbanAggregateOperationFieldMetadataId": [
                3
            ],
            "anyFieldFilterValue": [
                1
            ],
            "calendarLayout": [
                68
            ],
            "calendarFieldMetadataId": [
                3
            ],
            "visibility": [
                69
            ],
            "mainGroupByFieldMetadataId": [
                3
            ],
            "shouldHideEmptyGroups": [
                13
            ],
            "kanbanColumnWidth": [
                18
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
                454
            ],
            "viewFilters": [
                455
            ],
            "viewFilterGroups": [
                456
            ],
            "viewSorts": [
                457
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
                13
            ],
            "position": [
                7
            ],
            "size": [
                7
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
                59
            ],
            "value": [
                11
            ],
            "viewFilterGroupId": [
                3
            ],
            "positionInViewFilterGroup": [
                7
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
                57
            ],
            "positionInViewFilterGroup": [
                7
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
                62
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
                62
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
                460
            ],
            "__typename": [
                1
            ]
        },
        "UpdateViewSortInputUpdates": {
            "direction": [
                62
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
                464
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
                7
            ],
            "isVisible": [
                13
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
                7
            ],
            "isVisible": [
                13
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
                469
            ],
            "fields": [
                470
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
                7
            ],
            "isVisible": [
                13
            ],
            "fields": [
                470
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
                13
            ],
            "position": [
                7
            ],
            "__typename": [
                1
            ]
        },
        "CreateOneObjectInput": {
            "object": [
                472
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
                13
            ],
            "isRemote": [
                13
            ],
            "primaryKeyColumnType": [
                1
            ],
            "primaryKeyFieldMetadataSettings": [
                11
            ],
            "isLabelSyncedWithName": [
                13
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
                475
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
                13
            ],
            "labelIdentifierFieldMetadataId": [
                3
            ],
            "imageIdentifierFieldMetadataId": [
                3
            ],
            "isLabelSyncedWithName": [
                13
            ],
            "isSearchable": [
                13
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
                11
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
                18
            ],
            "minimumSendIntervalMs": [
                18
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
                13
            ],
            "workspaceDiscoverability": [
                71
            ],
            "allowImpersonation": [
                13
            ],
            "isGoogleAuthEnabled": [
                13
            ],
            "isMicrosoftAuthEnabled": [
                13
            ],
            "isPasswordAuthEnabled": [
                13
            ],
            "isGoogleAuthBypassEnabled": [
                13
            ],
            "isMicrosoftAuthBypassEnabled": [
                13
            ],
            "isPasswordAuthBypassEnabled": [
                13
            ],
            "defaultRoleId": [
                3
            ],
            "isTwoFactorAuthenticationEnforced": [
                13
            ],
            "trashRetentionDays": [
                7
            ],
            "eventLogRetentionDays": [
                7
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
                13
            ],
            "isInternalMessagesImportEnabled": [
                13
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
                57
            ],
            "positionInViewFilterGroup": [
                7
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
                57
            ],
            "positionInViewFilterGroup": [
                7
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
                178
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
                178
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
                502
            ],
            "__typename": [
                1
            ]
        },
        "UpdateMessageChannelInputUpdates": {
            "visibility": [
                165
            ],
            "isContactAutoCreationEnabled": [
                13
            ],
            "contactAutoCreationPolicy": [
                167
            ],
            "messageFolderImportPolicy": [
                168
            ],
            "isSyncEnabled": [
                13
            ],
            "excludeNonProfessionalEmails": [
                13
            ],
            "excludeGroupEmails": [
                13
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
                34
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
                7
            ],
            "isPinned": [
                13
            ],
            "availabilityType": [
                35
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
                11
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
                7
            ],
            "isPinned": [
                13
            ],
            "availabilityType": [
                35
            ],
            "availabilityObjectMetadataId": [
                3
            ],
            "engineComponentKey": [
                34
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
                509
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
                7
            ],
            "source": [
                11
            ],
            "cronTriggerSettings": [
                11
            ],
            "databaseEventTriggerSettings": [
                11
            ],
            "httpRouteTriggerSettings": [
                11
            ],
            "serverRouteTriggerSettings": [
                11
            ],
            "toolTriggerSettings": [
                11
            ],
            "workflowActionTriggerSettings": [
                11
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
                11
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
                513
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
                7
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
                11
            ],
            "databaseEventTriggerSettings": [
                11
            ],
            "httpRouteTriggerSettings": [
                11
            ],
            "toolTriggerSettings": [
                11
            ],
            "workflowActionTriggerSettings": [
                11
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
                7
            ],
            "pageLayoutId": [
                3
            ],
            "layoutMode": [
                84
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
                7
            ],
            "icon": [
                1
            ],
            "layoutMode": [
                84
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
                120
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
                120
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
                120
            ],
            "objectMetadataId": [
                3
            ],
            "tabs": [
                519
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
                7
            ],
            "icon": [
                1
            ],
            "layoutMode": [
                84
            ],
            "widgets": [
                520
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
                81
            ],
            "objectMetadataId": [
                3
            ],
            "gridPosition": [
                521
            ],
            "position": [
                11
            ],
            "configuration": [
                11
            ],
            "conditionalDisplay": [
                11
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
                7
            ],
            "column": [
                7
            ],
            "rowSpan": [
                7
            ],
            "columnSpan": [
                7
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
                11
            ],
            "modelConfiguration": [
                11
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
                11
            ],
            "modelConfiguration": [
                11
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
                13
            ],
            "canAccessAllTools": [
                13
            ],
            "canReadAllObjectRecords": [
                13
            ],
            "canUpdateAllObjectRecords": [
                13
            ],
            "canSoftDeleteAllObjectRecords": [
                13
            ],
            "canDestroyAllObjectRecords": [
                13
            ],
            "canBeAssignedToUsers": [
                13
            ],
            "canBeAssignedToAgents": [
                13
            ],
            "canBeAssignedToApiKeys": [
                13
            ],
            "__typename": [
                1
            ]
        },
        "UpdateRoleInput": {
            "update": [
                526
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
                13
            ],
            "canAccessAllTools": [
                13
            ],
            "canReadAllObjectRecords": [
                13
            ],
            "canUpdateAllObjectRecords": [
                13
            ],
            "canSoftDeleteAllObjectRecords": [
                13
            ],
            "canDestroyAllObjectRecords": [
                13
            ],
            "canBeAssignedToUsers": [
                13
            ],
            "canBeAssignedToAgents": [
                13
            ],
            "canBeAssignedToApiKeys": [
                13
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
                528
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
                13
            ],
            "canUpdateObjectRecords": [
                13
            ],
            "canSoftDeleteObjectRecords": [
                13
            ],
            "canDestroyObjectRecords": [
                13
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
                531
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
                13
            ],
            "canUpdateFieldValue": [
                13
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
                533
            ],
            "predicateGroups": [
                534
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
                10
            ],
            "value": [
                11
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
                7
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
                8
            ],
            "positionInRowLevelPermissionPredicateGroup": [
                7
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
                235
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
                81
            ],
            "objectMetadataId": [
                3
            ],
            "gridPosition": [
                521
            ],
            "position": [
                11
            ],
            "configuration": [
                11
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
                81
            ],
            "objectMetadataId": [
                3
            ],
            "gridPosition": [
                521
            ],
            "position": [
                11
            ],
            "configuration": [
                11
            ],
            "conditionalDisplay": [
                11
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
                543
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
                546
            ],
            "__typename": [
                1
            ]
        },
        "UpdateMessageFolderInputUpdates": {
            "isSynced": [
                13
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
                546
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
                18
            ],
            "selectedOptionIndices": [
                18
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
                13
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
            "files": [
                559
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
                13
            ],
            "__typename": [
                1
            ]
        },
        "CreateOneAppTokenInput": {
            "appToken": [
                562
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
                190,
                {
                    "eventStreamId": [
                        1,
                        "String!"
                    ]
                }
            ],
            "logicFunctionLogs": [
                193,
                {
                    "input": [
                        564,
                        "LogicFunctionLogsInput!"
                    ]
                }
            ],
            "onAgentChatEvent": [
                362,
                {
                    "threadId": [
                        3,
                        "UUID!"
                    ]
                }
            ],
            "eventLogsLive": [
                351,
                {
                    "table": [
                        397,
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