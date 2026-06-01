import React from 'react';
import IAStudioChat from './IAStudioChat';
import IAStudioDiff from './IAStudioDiff';
import IAStudioContextConfigModal from './IAStudioContextConfigModal';
import { parseDestinationsFromResponse, QUICK_ACTIONS } from './IAStudioUtils';
import { useIAStudioState } from './hooks/useIAStudioState';

const IAStudio = () => {
    const {
        // States
        isLoading,
        isLoadingAutoCorrect,
        diffBlocks,
        showContextModal,
        showDestinationModal,
        selectedAction,
        sectionMode,
        sectionConfig,
        currentSectionIndex,
        accumulatedSections,
        activeFragment,
        activeResolution,
        chatModel,
        chatReasoningMode,
        chatReasoningEffort,
        messages,
        activeSession,
        contextSelections,
        activeBook,
        chapters,
        characters,
        worldItems,
        compressContext,
        destinationDoc,
        defaultModel,

        // Setters for UI modals
        setShowContextModal,
        setShowDestinationModal,
        setDiffBlocks,
        setActiveResolution,
        setCompressContext,

        // Callbacks / Handlers
        handleSend,
        handleResolveInconsistency,
        handleReopenInconsistency,
        handleCancelStream,
        handleRemoveContextItem,
        handleRegenerate,
        handleAutoCorrectPatch,
        handleApplyToSelection,
        handleApplyChanges,
        handleExport,
        handleNewChat,
        handleModelChange,
        handleReasoningModeChange,
        handleReasoningEffortChange,
        handleActionChange,
        handleFragmentChange,
        handleSectionModeChange,
        deleteMessage,
        renameSession,
        deleteSession
    } = useIAStudioState();

    return (
        <div className="h-full flex bg-[var(--bg-app)] overflow-hidden">
            <IAStudioChat
                messages={messages}
                onSend={handleSend}
                onDeleteMessage={deleteMessage}
                activeSession={activeSession}
                onRenameSession={renameSession}
                onDeleteSession={deleteSession}
                onShowDiff={(content) => {
                    const parsed = parseDestinationsFromResponse(content, destinationDoc, chapters, worldItems, characters);
                    setDiffBlocks(parsed);
                }}
                isLoading={isLoading}
                selectedAction={selectedAction}
                onNewChat={handleNewChat}
                onOpenContext={() => setShowContextModal(true)}
                onOpenDestination={() => setShowDestinationModal(true)}
                onOpenSessions={() => window.dispatchEvent(new CustomEvent('open-mobile-sidebar'))}
                onExport={handleExport}
                QUICK_ACTIONS={QUICK_ACTIONS}
                selectedModel={chatModel || defaultModel}
                chatReasoningMode={chatReasoningMode}
                onReasoningModeChange={handleReasoningModeChange}
                chatReasoningEffort={chatReasoningEffort}
                onReasoningEffortChange={handleReasoningEffortChange}
                contextSelections={contextSelections}
                activeBook={activeBook}
                chapters={chapters}
                characters={characters}
                worldItems={worldItems}
                onModelChange={handleModelChange}
                onRemoveContextItem={handleRemoveContextItem}
                onCancelStream={handleCancelStream}
                onRegenerate={handleRegenerate}
                compressContext={compressContext}
                onToggleCompress={() => setCompressContext(prev => !prev)}
                activeFragment={activeFragment}
                sectionMode={sectionMode}
                sectionConfig={sectionConfig}
                currentSectionIndex={currentSectionIndex}
                accumulatedSections={accumulatedSections}
                destinationDoc={destinationDoc}
                onResolveInconsistency={handleResolveInconsistency}
                onReopenInconsistency={handleReopenInconsistency}
                onActionChange={handleActionChange}
                onFragmentChange={handleFragmentChange}
                onSectionModeChange={handleSectionModeChange}
            />

            {/* Diff Modal */}
            {diffBlocks && diffBlocks.length > 0 && (
                <IAStudioDiff
                    diffBlocks={diffBlocks}
                    destinationTitle={diffBlocks[0]?.title}
                    onApply={handleApplyChanges}
                    onClose={() => {
                        setDiffBlocks(null);
                        setActiveResolution(null);
                    }}
                    onRegenerate={() => {
                        if (activeResolution) {
                            handleResolveInconsistency(
                                activeResolution.messageId,
                                activeResolution.inconsistencyId,
                                activeResolution.option,
                                activeResolution.customText || 'applied',
                                true // isRetry
                            );
                        } else {
                            handleRegenerate();
                        }
                    }}
                    accumulatedSections={accumulatedSections}
                    activeResolution={activeResolution}
                    onAutoCorrectPatch={handleAutoCorrectPatch}
                    onApplyToSelection={handleApplyToSelection}
                    isLoadingAutoCorrect={isLoadingAutoCorrect}
                />
            )}

            {/* Context Config Modal */}
            <IAStudioContextConfigModal
                isOpen={showContextModal}
                onClose={() => setShowContextModal(false)}
                chapters={chapters}
                worldItems={worldItems}
                characters={characters}
                mode="context"
            />

            {/* Destination Config Modal */}
            <IAStudioContextConfigModal
                isOpen={showDestinationModal}
                onClose={() => setShowDestinationModal(false)}
                chapters={chapters}
                worldItems={worldItems}
                characters={characters}
                mode="destination"
            />
        </div>
    );
};

export default IAStudio;
