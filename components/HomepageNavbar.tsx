'use client';
import SupacordLogo from '@/public/supacord_logo_transparent.png';
import Supacord from '@/public/supacord_text.png';
import Image from 'next/image';
import { User } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@mantine/core';
import { CircleUser } from 'lucide-react';

interface HomepageNavbarProps
{
    user: User | null;
}

export default function HomepageNavbar({ user }: HomepageNavbarProps)
{
    const navRef = useRef<HTMLDivElement>(null);


    useEffect(() => 
    {
        // when the scroll is greater than 0, add the classname bg-neutral-900 and border-b-[1px] border-b-neutral-700
        // otherwise remove the classname
        const handleScroll = () => 
        {
            if (window.scrollY > 0) 
                navRef.current?.classList.add('border-b-[1px]');
            else 
                navRef.current?.classList.remove('border-b-[1px]');
        };

        // add the event listener
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return <nav ref={navRef} className='w-full flex flex-row gap-3 items-center justify-center py-6 border-b-neutral-700 sticky transition bg-primary top-0 z-50'>
        {/* <Image src={SupacordBanner} alt='Supacord' width={200} height={60} /> */}
        <div className='w-full flex max-w-7xl items-center gap-3'>
            <Image src={SupacordLogo} alt='Supacord' width={40} height={40} />
            <Image src={Supacord} alt='Supacord' width={150} height={40} />
            <section className='ml-16 flex gap-5 items-center'>
                <Button>
                    Features
                </Button>
                <Button>
                    Use Cases
                </Button>
                <Button>
                    Data & Security
                </Button>
                <Button>
                    Pricing
                </Button>
            </section>
            <section className='ml-auto flex gap-5 items-center'>
                {
                    !user &&
                    <Link href='/auth'>
                        <Button variant='white'>
                            Join The Alpha Now
                        </Button>
                    </Link>
                }
                {
                    user &&
                    <>
                        <Link href='/app'>
                            <Button variant='white'>
                                Go To App &rarr;
                            </Button>
                        </Link>
                        <Link href='/app'>
                            <Button variant='white' leftSection={<CircleUser />}>
                                My Account
                            </Button>
                        </Link>
                    </>
                }
            </section>
        </div>
    </nav>;
}
