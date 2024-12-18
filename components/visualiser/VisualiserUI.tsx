

'use client';

import { Macro, Notebook, NotebookEntry, OutputType, Profile, Project } from '@/lib/global.types';
import { Button, Divider, Menu, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { BookOpen, BookPlus, ChevronsLeft, ChevronsRight, HelpCircle, MoreHorizontal, Search, Trash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { v4 } from 'uuid';
import { createBrowserClient } from '@/utils/supabaseBrowser';
import NotebookEntryUI from './generative_ui/NotebookEntryUI';
import { useRouter } from 'next/navigation';
import LogoLoader from '../LogoLoader';


interface Section {
    type: OutputType;
    content: string;
}

interface VisualiserUIProps
{
    profile: Profile;
    project: Project;
    notebooks: Notebook[];
    macros: Macro[];
    preSelectedNotebookId: string;
    preSelectedNotebookEntries: NotebookEntry[];
}

/**
 * VisualiserUI Component
 * 
 * A comprehensive interface for interacting with SQL notebooks and macros in a data visualization context.
 * 
 * @component
 * 
 * Props:
 * @param {Profile} profile - User profile information including authentication details
 * @param {Project} project - Current project context including database connection info
 * @param {Notebook[]} notebooks - Array of available notebooks
 * @param {Macro[]} macros - Array of saved macros for the project
 * @param {string} preSelectedNotebookId - ID of notebook to load initially (if any)
 * @param {NotebookEntry[]} preSelectedNotebookEntries - Pre-loaded entries for the selected notebook
 * 
 * Features:
 * - Notebook Management:
 *   - Create new notebooks
 *   - Switch between existing notebooks
 *   - Delete notebooks
 *   - Rename notebooks
 * 
 * - Query Interface:
 *   - Natural language query input
 *   - Real-time query processing
 *   - Loading states and error handling
 * 
 * - Visualization:
 *   - Multiple visualization types (charts, tables, etc)
 *   - Responsive layout with collapsible sidebars
 *   - Entry history with metadata
 * 
 * - Macro Integration:
 *   - Create macros from queries
 *   - View and manage saved macros
 *   - Macro scheduling and automation
 * 
 * State Management:
 * - Tracks loading states
 * - Manages notebook selection and entries
 * - Handles user input and query processing
 * - Maintains sidebar collapse states
 * 
 * Layout:
 * - Three-panel design:
 *   - Left: Notebook navigation
 *   - Center: Query interface and visualizations
 *   - Right: Saved macros
 * - Responsive with collapsible panels
 * - Sticky headers and input areas
 */

export default function VisualiserUI({ 
    profile,
    project, 
    notebooks: n,
    macros: m,
    preSelectedNotebookId,
    preSelectedNotebookEntries,
}: VisualiserUIProps)
{
    const router = useRouter();
    const supabase = createBrowserClient();
    const mainBodyRef = useRef<HTMLDivElement>(null);
    const sideBarRef = useRef<HTMLDivElement>(null);
    const savedMacroRef = useRef<HTMLDivElement>(null);

    const [isLoadingNotebook, setIsLoadingNotebook] = useState(!!preSelectedNotebookId && n.some(x => x.id === preSelectedNotebookId));
    const [isHovering, setIsHovering] = useState(false);
    const [isMacroHovering, setIsMacroHovering] = useState(false);
    const [userSearch, setUserSearch] = useState('');

    const [notebooks, setNotebooks] = useState(n);
    const [selectedNotebookId, setSelectedNotebookId] = useState(preSelectedNotebookId ?? '');

    const [macros, setMacros] = useState(m);
    const [notebookEntries, setNotebookEntries] = useState<NotebookEntry[]>(preSelectedNotebookEntries);
    const [isSendingMessage, setIsSendingMessage] = useState(false);


    async function sendMessage()
    {
        if (isSendingMessage)
            return;

        setIsSendingMessage(true);

        let notebookId = selectedNotebookId;

        if (!selectedNotebookId)
        {
            const { data: newNotebook, error } = await supabase
                .from('notebooks')
                .insert({
                    id: v4(),
                    title: 'Untitled Notebook',
                    projectId: project.id,
                })
                .select('*')
                .single();

            if (error)
            {
                console.error('Error creating new notebook:', error.message);
                notifications.show({ title: 'Error', message: 'Failed to create new notebook', color: 'red' });
                setIsSendingMessage(false);
                return;
            }

            setSelectedNotebookId(newNotebook.id);
            notebookId = newNotebook.id;
            setNotebooks(notebooks => [...notebooks, newNotebook]);
        }


        const localNotebookEntries = [...notebookEntries];
        const newNotebookEntry: NotebookEntry = {
            id: v4(),
            createdAt: new Date().toISOString(),
            notebookId,
            userPrompt: userSearch,
            sqlQueries: [],
            outputs: [],
        };
        localNotebookEntries.push(newNotebookEntry);
        setNotebookEntries(localNotebookEntries);

        const { error } = await supabase.from('notebook_entries').insert(newNotebookEntry);
        if (error)
        {
            console.error('Error creating new notebook entry:', error.message);
            notifications.show({ title: 'Error', message: 'Failed to create new notebook entry', color: 'red' });
            setIsSendingMessage(false);
            setNotebookEntries(localNotebookEntries.slice(0, -1));
            return;
        }

        setUserSearch('');

        const response = await fetch(`/app/${project.id}/visualiser-search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                projectId: project.id,
                chatHistory: localNotebookEntries.slice(-5),
                notebookId: notebookId,
                notebookEntryId: newNotebookEntry.id,
                version: 1,
            })
        });

        if (!response.ok)
        {
            console.error('Error sending message:', response.statusText);
            notifications.show({ title: 'Error', message: 'Failed to send message', color: 'red' });
            setIsSendingMessage(false);
            return;
        }

        // get the stream
        const stream = response.body;
        if (!stream)
        {
            notifications.show({ title: 'Error', message: 'Failed to get stream from response', color: 'red' });
            setIsSendingMessage(false);
            return;
        }

        // listen for messages
        let done = false;
        const reader = stream.getReader();

        while (!done)
        {
            const { value, done: isDone } = await reader.read();
            if (isDone)
            {
                done = true;
                break;
            }

            const message = new TextDecoder().decode(value);
            console.log('new chunk::', message);

            // for notebook entries, we want to get the last one and then add to the latest version output.
            const lastEntry = localNotebookEntries[localNotebookEntries.length - 1];
            if (lastEntry.outputs.length === 0)
                lastEntry.outputs.push({
                    version: 1,
                    chunks: [],
                });

            const latestOutput = lastEntry.outputs[lastEntry.outputs.length - 1];

            // update the latest output with the new content
            // latest output has a version and chunks, which contains its own stuff.
            const section = extractSection(message);
            if (section)
            {
                if (section.type === OutputType.SQL)
                {
                    lastEntry.sqlQueries.push(section.content);
                }
                else
                {
                    latestOutput.chunks.push({
                        content: section?.content || message,
                        type: section.type,
                    });
                }
            }

            // update the notebook entries
            setNotebookEntries(localNotebookEntries);
        }

        reader.releaseLock();
        setIsSendingMessage(false);

        // now we dispatch the title generation
        const titleResponse = await fetch(`/app/${project.id}/notebook-naming`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectId: project.id,
                notebookId,
                userPrompt: userSearch
            })
        });

        if (!titleResponse.ok)
        {
            console.error('Error generating title:', titleResponse.statusText);
            notifications.show({ title: 'Error', message: 'Failed to generate title', color: 'red' });
            return;
        }

        const { title } = await titleResponse.json();
        if (title)
        {
            setNotebooks(notebooks => notebooks.map(notebook =>
            {
                if (notebook.id === notebookId)
                    return { ...notebook, title };
                return notebook;
            }));
        }
    }


    function extractSection(text: string): Section | null
    {
        const allTypes = Object.values(OutputType).map(type => type.toUpperCase());
        for (const type of allTypes)
        {
            const startMarker = `=====${type.toUpperCase()}=====`;
            const endMarker = '=====END ' + type.toUpperCase() + '=====';
        
            const startIndex = text.indexOf(startMarker);
            if (startIndex === -1)
            {
                console.error('No start marker found for:', type);
                continue;
            }
        
            const contentStartIndex = startIndex + startMarker.length;
            const endIndex = text.indexOf(endMarker, contentStartIndex);
            if (endIndex === -1)
            {
                console.error('No end marker found for:', type);
                continue;
            }
            
            console.log('Extracted:', type);
            return {
                type: type.toLowerCase() as OutputType,
                content: text.substring(contentStartIndex, endIndex).trim()
            };
        }

        return null;
    }


    useEffect(() => 
    {
        // if the URL query param has a notebookId, we want to select that notebook
        if (preSelectedNotebookId && n.some(x => x.id === preSelectedNotebookId))
            setSelectedNotebookId(preSelectedNotebookId);
        else
            router.replace(`/app/${project.id}`, undefined);
    }, []);

    useEffect(() => 
    {
        if (selectedNotebookId && !isSendingMessage)
        {
            setIsLoadingNotebook(true);
            router.replace(`/app/${project.id}?notebookId=${selectedNotebookId}`, undefined);
            supabase
                .from('notebook_entries')
                .select('*')
                .eq('notebookId', selectedNotebookId)
                .order('createdAt', { ascending: true })
                .then(({ data, error }) => 
                {
                    if (error)
                    {
                        console.error('Error fetching notebook entries:', error.message);
                        notifications.show({ title: 'Error', message: 'Failed to fetch notebook entries', color: 'red' });
                        setIsLoadingNotebook(false);
                        return;
                    }

                    setNotebookEntries(data as NotebookEntry[] || []);

                    // scroll to the bottom of the notebook entries
                    if (mainBodyRef.current)
                        mainBodyRef.current.scrollTop = mainBodyRef.current.scrollHeight;
                    setIsLoadingNotebook(false);
                });
        }
    }, [selectedNotebookId]);


    return <div className="flex-grow flex w-full relative">
        <section
            ref={sideBarRef}
            className={`overflow-x-hidden min-w-[250px]
                flex flex-col h-[calc(100vh-60px)] max-h-full overflow-y-auto bg-primary border-r-[1px] border-r-neutral-700 px-4 pb-4 transition-all duration-300 relative
                ${isHovering ? 'w-[500px] bg-opacity-75 backdrop-blur-sm' : 'w-[250px]'}`}
        >
            <h4 className='pt-2 line-clamp-2'> 
                {project.databaseName}
            </h4>
            <Divider className='mt-2 mb-4' />
            <Button fullWidth={false} variant='outline' size='xs' rightSection={<BookPlus size={20} />} onClick={() => 
            {
                setSelectedNotebookId('');
                setNotebookEntries([]);
            }}>
                Start New Notebook
            </Button>
            <div className='mt-3 flex flex-col gap-1'>
                {
                    notebooks.length === 0 &&
                    <small className='text-neutral-500 font-medium text-center'>
                        No notebooks exist yet.
                    </small>
                }
                {
                    notebooks.map((notebook, index) => <button key={index} className={`text-xs rounded transition text-green hover:text-black font-semibold hover:bg-green p-2 w-full text-left ${selectedNotebookId === notebook.id ? 'bg-green text-black' : ''}`} onClick={() => setSelectedNotebookId(notebook.id)}>
                        {notebook.title}
                    </button>)
                }
            </div>
            {/* Make a button that goes halfway down and sits on the right border with chevrons to expand or close */}
            <button className='absolute -right-3 top-[45%] z-auto p-2 w-fit rounded-full' onClick={() => setIsHovering(!isHovering)}>
                {
                    isHovering ? <ChevronsLeft size={24} /> : <ChevronsRight size={24} />
                }
            </button>
        </section>
        <section className='flex-grow max-h-[calc(100vh-60px)] border-x-[1px] border-neutral-700 z-30 relative overflow-x-hidden'>
            <nav className='w-full sticky top-0 bg-primary border-b-[1px] border-neutral-700 p-2 grid grid-cols-10'>
                <div className='col-span-2' />
                <input
                    disabled={isSendingMessage || !selectedNotebookId}
                    value={notebooks.find(x => x.id === selectedNotebookId)?.title !== undefined ? notebooks.find(x => x.id === selectedNotebookId)?.title : 'New Notebook'}
                    onChange={e => 
                    {
                        const newTitle = e.currentTarget.value;
                        setNotebooks(notebooks => notebooks.map(notebook => 
                        {
                            if (notebook.id === selectedNotebookId)
                                return { ...notebook, title: newTitle };
                            return notebook;
                        }));
                    }}
                    onBlur={async () => 
                    {
                        const notebook = notebooks.find(x => x.id === selectedNotebookId);
                        if (!notebook)
                            return;

                        const { error } = await supabase
                            .from('notebooks')
                            .update({ title: notebook.title })
                            .eq('id', selectedNotebookId);

                        if (error)
                        {
                            console.error('Error updating notebook:', error.message);
                            notifications.show({ title: 'Error', message: 'Failed to update notebook', color: 'red' });
                        }
                    }}
                    onKeyDown={async e => 
                    {
                        if (e.key === 'Enter')
                        {
                            e.preventDefault();
                            const notebook = notebooks.find(x => x.id === selectedNotebookId);
                            if (!notebook)
                                return;

                            const { error } = await supabase
                                .from('notebooks')
                                .update({ title: notebook.title })
                                .eq('id', selectedNotebookId);

                            if (error)
                            {
                                console.error('Error updating notebook:', error.message);
                                notifications.show({ title: 'Error', message: 'Failed to update notebook', color: 'red' });
                            }
                        }
                    }}
                    type='text' placeholder='Your Notebook Name' className='col-span-6 focus:outline-none text-center bg-transparent font-medium' />
                <div className='col-span-2 flex justify-end'>
                    <Menu shadow='md' width={250} position={'bottom-end'} disabled={!selectedNotebookId}>
                        <Menu.Target>
                            <MoreHorizontal size={24} className='transition hover:text-green hover:cursor-pointer' />
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>
                                Notebook Settings
                            </Menu.Label>
                            <Menu.Item color='red' onClick={async () => 
                            {
                                if (confirm('Are you sure you want to delete this notebook?'))
                                {
                                    const { error } = await supabase
                                        .from('notebooks')
                                        .delete()
                                        .eq('id', selectedNotebookId);

                                    if (error)
                                    {
                                        console.error('Error deleting notebook:', error.message);
                                        notifications.show({ title: 'Error', message: 'Failed to delete notebook', color: 'red' });
                                    }
                                    else
                                    {
                                        setNotebooks(notebooks => notebooks.filter(x => x.id !== selectedNotebookId));
                                        setSelectedNotebookId('');
                                        setNotebookEntries([]);
                                    }
                                }
                            }}>
                                <div className='flex items-center gap-3 justify-between'>
                                    <b>Delete Notebook</b> <Trash size={24} />
                                </div>
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </div>
            </nav>
            <div ref={mainBodyRef} className='h-full flex-grow flex flex-col max-h-[calc(100vh-60px-42px)] relative'>
                {
                    isLoadingNotebook && <div className='inset-0 absolute bg-primary bg-opacity-75 backdrop-blur-sm z-50 flex flex-col gap-3 items-center justify-center'>
                        <LogoLoader />
                        <h4>
                            Loading Notebook...
                        </h4>
                    </div>
                }
                <section className='flex-grow overflow-y-auto flex flex-col gap-3 p-4 bg-[#0e0e0e]'>
                    {
                        notebookEntries.length === 0 && <div className='text-center text-neutral-500 font-medium flex-grow flex flex-col gap-3 items-center justify-center h-full'>
                            <BookOpen size={64} className='text-green' />
                            Start a new notebook by entering a search query below.
                            <br />
                            <br />
                            <span className='max-w-xl'>
                                Notebooks are designed to be testing grounds for creating new macros and dynamically querying <b>{project.databaseName}</b>
                            </span>
                        </div>
                    }
                    {
                        notebookEntries.length > 0 &&
                        notebookEntries.map((entry, index) => <NotebookEntryUI
                            profile={profile}
                            disabled={isSendingMessage && index === notebookEntries.length - 1}
                            key={index}
                            project={project}
                            notebookEntry={entry}
                            onDeleteEntry={() => setNotebookEntries(notebookEntries => notebookEntries.filter(x => x.id !== entry.id))}
                            onMacroCreated={newMacro => setMacros(macros => [...macros, newMacro])}
                        />)
                    }
                </section>
                <div className='flex flex-row gap-3 bg-[#0e0e0e] p-2 sticky bottom-0'>
                    <Textarea
                        disabled={isSendingMessage}
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.currentTarget.value)}
                        placeholder='What would you like to visualise?'
                        className='w-full'
                        minRows={5}
                        maxRows={15}
                        autoFocus
                        size='lg'
                        onKeyDown={e => 
                        {
                            if (e.key === 'Enter' && !e.shiftKey)
                            {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                    />
                    <Button onClick={sendMessage} loading={isSendingMessage}>
                        <Search size={24} />
                    </Button>
                </div>
            </div>
        </section>
        <section
            ref={savedMacroRef}
            className={`overflow-x-hidden min-w-[250px]
                flex flex-col h-[calc(100vh-60px)] overflow-y-auto bg-primary border-l-[1px] border-neutral-700 px-4 pb-4 transition-all duration-300 z-30 relative
                ${isMacroHovering ? 'w-[500px] bg-opacity-75 backdrop-blur-sm' : 'w-[250px]'}`}
        >
            <section className='flex gap-3 items-center justify-between pt-2'>
                <h4 className='line-clamp-2'> 
                    Project Macros
                </h4>
                <HelpCircle size={20} className='text-green hover:text-green-400 transition hover:cursor-pointer' />
            </section>
            <Divider className='mt-2 mb-4' />
            {
                macros.length === 0 &&
                <small className='text-neutral-500 font-medium text-center'>
                    No macros exist yet. Create one by saving it from a notebook.
                </small>
            }
            {
                macros.map((macro, index) => <button key={index} className='text-[15px] rounded transition text-green hover:text-white font-semibold hover:bg-green p-2'>
                    {macro.textPrompt}
                </button>)
            }
            <button className='absolute -left-3 top-[45%] z-auto p-2 w-fit rounded-full' onClick={() => setIsMacroHovering(!isMacroHovering)}>
                {
                    isMacroHovering ? <ChevronsRight size={24} /> : <ChevronsLeft size={24} />
                }
            </button>
        </section>
    </div>;
}