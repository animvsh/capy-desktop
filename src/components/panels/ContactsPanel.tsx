/**
 * ContactsPanel - Full contacts management with tabs, search, and dialogs
 * Matches the original Contacts.tsx page exactly
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { supabase, supabaseUntyped } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import capyLogo from '@/assets/capy-logo.png';

type Contact = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  source: 'email' | 'linkedin' | 'both' | 'custom';
  status: 'fresh' | 'reached_out' | 'replied' | 'meeting_booked';
  channel: 'email' | 'linkedin' | 'both';
  icp_score: number | null;
  created_at: string;
  last_contacted_at: string | null;
  is_custom?: boolean;
};

type TabKey = 'all' | 'email' | 'linkedin' | 'reached_out' | 'replied';

type EmailThread = {
  id: string;
  subject: string;
  body: string;
  sent_at: string;
  direction: 'outbound' | 'inbound';
};

type NewContactForm = {
  name: string;
  email: string;
  title: string;
  company: string;
  linkedin_url: string;
  channel: 'email' | 'linkedin' | 'both';
};

export function ContactsPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { setSelectedItem } = useApp();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [emailThread, setEmailThread] = useState<EmailThread[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [newContact, setNewContact] = useState<NewContactForm>({
    name: '',
    email: '',
    title: '',
    company: '',
    linkedin_url: '',
    channel: 'email',
  });

  useEffect(() => {
    if (user) {
      fetchContacts();
    }
  }, [user]);

  const fetchContacts = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch email leads
      const { data: emailLeads } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // Fetch LinkedIn leads
      const { data: linkedinLeads } = await supabase
        .from('linkedin_leads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // Merge and deduplicate by email or linkedin_url
      const contactMap = new Map<string, Contact>();

      // Process email leads
      for (const lead of emailLeads || []) {
        const key = lead.email || lead.linkedin_url || lead.id;
        contactMap.set(key, {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          title: lead.title,
          company: lead.company,
          linkedin_url: lead.linkedin_url,
          source: 'email',
          status: lead.status === 'approved' ? 'reached_out' : 'fresh',
          channel: 'email',
          icp_score: lead.icp_score,
          created_at: lead.created_at || new Date().toISOString(),
          last_contacted_at: lead.approved_at,
        });
      }

      // Process LinkedIn leads (merge if exists)
      for (const lead of linkedinLeads || []) {
        const emailKey = lead.email;
        const linkedinKey = lead.linkedin_url;

        // Check if contact already exists
        let existingKey = emailKey && contactMap.has(emailKey) ? emailKey :
                         linkedinKey && contactMap.has(linkedinKey) ? linkedinKey : null;

        if (existingKey) {
          // Merge with existing
          const existing = contactMap.get(existingKey)!;
          contactMap.set(existingKey, {
            ...existing,
            linkedin_url: lead.linkedin_url || existing.linkedin_url,
            source: 'both',
            channel: 'both',
            icp_score: lead.icp_score || existing.icp_score,
          });
        } else {
          // New contact
          const key = linkedinKey || lead.id;
          contactMap.set(key, {
            id: lead.id,
            name: lead.name,
            email: lead.email,
            title: lead.title,
            company: lead.company,
            linkedin_url: lead.linkedin_url,
            source: 'linkedin',
            status: lead.status === 'reached_out' ? 'reached_out' : 'fresh',
            channel: 'linkedin',
            icp_score: lead.icp_score,
            created_at: lead.created_at,
            last_contacted_at: lead.reached_out_at,
          });
        }
      }

      // Fetch custom contacts from leads with source = 'custom'
      const { data: customContacts } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', user.id)
        .eq('source', 'custom')
        .order('created_at', { ascending: false });

      // Add custom contacts
      for (const contact of customContacts || []) {
        contactMap.set(`custom-${contact.id}`, {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          title: contact.title,
          company: contact.company,
          linkedin_url: contact.linkedin_url,
          source: 'custom',
          status: contact.status === 'approved' ? 'reached_out' : 'fresh',
          channel: contact.linkedin_url && contact.email ? 'both' : contact.linkedin_url ? 'linkedin' : 'email',
          icp_score: contact.icp_score,
          created_at: contact.created_at || new Date().toISOString(),
          last_contacted_at: contact.approved_at,
          is_custom: true,
        });
      }

      setContacts(Array.from(contactMap.values()));
    } catch (err) {
      console.error('Error fetching contacts:', err);
      toast({
        title: 'Error',
        description: 'Failed to load contacts',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addContact = async () => {
    if (!user) return;
    if (!newContact.name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a contact name',
        variant: 'destructive',
      });
      return;
    }
    if (!newContact.email.trim() && !newContact.linkedin_url.trim()) {
      toast({
        title: 'Contact info required',
        description: 'Please enter an email or LinkedIn URL',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('leads').insert({
        user_id: user.id,
        name: newContact.name.trim(),
        email: newContact.email.trim() || null,
        title: newContact.title.trim() || null,
        company: newContact.company.trim() || null,
        linkedin_url: newContact.linkedin_url.trim() || null,
        source: 'custom',
        status: 'pending',
      });

      if (error) throw error;

      toast({
        title: 'Contact added',
        description: `${newContact.name} has been added to your contacts`,
      });

      // Reset form and close dialog
      setNewContact({
        name: '',
        email: '',
        title: '',
        company: '',
        linkedin_url: '',
        channel: 'email',
      });
      setAddDialogOpen(false);
      fetchContacts();
    } catch (err) {
      console.error('Error adding contact:', err);
      toast({
        title: 'Error',
        description: 'Failed to add contact',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async () => {
    if (!selectedContact) return;

    setDeleting(true);
    try {
      // Delete from the appropriate table based on source
      if (selectedContact.source === 'linkedin') {
        const { error } = await supabase
          .from('linkedin_leads')
          .delete()
          .eq('id', selectedContact.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('leads')
          .delete()
          .eq('id', selectedContact.id);
        if (error) throw error;
      }

      toast({
        title: 'Contact deleted',
        description: `${selectedContact.name} has been removed`,
      });

      setDeleteDialogOpen(false);
      setSelectedContact(null);
      fetchContacts();
    } catch (err) {
      console.error('Error deleting contact:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete contact',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const openContactDetail = async (contact: Contact) => {
    setSelectedContact(contact);
    setDetailDialogOpen(true);

    // Update app context
    setSelectedItem({
      type: 'contact',
      id: contact.id,
      data: {
        name: contact.name,
        company: contact.company,
        title: contact.title,
      },
    });

    // If email contact, try to load email thread
    if (contact.email && (contact.channel === 'email' || contact.channel === 'both')) {
      setLoadingThread(true);
      try {
        // Fetch outreach records for this lead
        const { data: outreach } = await supabase
          .from('outreach')
          .select('*')
          .eq('lead_id', contact.id)
          .order('sent_at', { ascending: true });

        // Fetch any received emails
        const { data: received } = await supabase
          .from('received_emails')
          .select('*')
          .eq('from_email', contact.email)
          .eq('user_id', user?.id)
          .order('received_at', { ascending: true });

        const thread: EmailThread[] = [];

        // Add outbound emails
        for (const email of outreach || []) {
          if (email.sent_at) {
            thread.push({
              id: email.id,
              subject: email.subject || 'No subject',
              body: email.body || '',
              sent_at: email.sent_at,
              direction: 'outbound',
            });
          }
        }

        // Add inbound emails
        for (const email of received || []) {
          thread.push({
            id: email.id,
            subject: email.subject || 'Re: ',
            body: email.body || '',
            sent_at: email.received_at,
            direction: 'inbound',
          });
        }

        // Sort by date
        thread.sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
        setEmailThread(thread);
      } catch (err) {
        console.error('Error loading email thread:', err);
      } finally {
        setLoadingThread(false);
      }
    } else {
      setEmailThread([]);
    }
  };

  const openDeleteDialog = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedContact(contact);
    setDeleteDialogOpen(true);
  };

  const filteredContacts = contacts
    .filter((contact) => {
      // Tab filter
      if (activeTab === 'email' && contact.channel !== 'email' && contact.channel !== 'both') return false;
      if (activeTab === 'linkedin' && contact.channel !== 'linkedin' && contact.channel !== 'both') return false;
      if (activeTab === 'reached_out' && contact.status !== 'reached_out') return false;
      if (activeTab === 'replied' && contact.status !== 'replied') return false;

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          contact.name.toLowerCase().includes(q) ||
          contact.email?.toLowerCase().includes(q) ||
          contact.company?.toLowerCase().includes(q) ||
          contact.title?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      // Sort by ICP score, then by date
      const scoreA = a.icp_score ?? -1;
      const scoreB = b.icp_score ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const stats = {
    total: contacts.length,
    email: contacts.filter(c => c.channel === 'email' || c.channel === 'both').length,
    linkedin: contacts.filter(c => c.channel === 'linkedin' || c.channel === 'both').length,
    reached_out: contacts.filter(c => c.status === 'reached_out').length,
    replied: contacts.filter(c => c.status === 'replied').length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'reached_out':
        return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600">Reached Out</span>;
      case 'replied':
        return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-forest/20 text-forest">Replied</span>;
      case 'meeting_booked':
        return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600">Meeting</span>;
      default:
        return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Fresh</span>;
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <i className="fa-solid fa-envelope h-3.5 w-3.5 text-blue-500" />;
      case 'linkedin':
        return <i className="fa-brands fa-linkedin h-3.5 w-3.5 text-[#0A66C2]" />;
      case 'both':
        return (
          <div className="flex items-center gap-0.5">
            <i className="fa-solid fa-envelope h-3 w-3 text-blue-500" />
            <i className="fa-brands fa-linkedin h-3 w-3 text-[#0A66C2]" />
          </div>
        );
      default:
        return null;
    }
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'Title', 'Company', 'LinkedIn URL', 'Channel', 'Status', 'ICP Score', 'Added'];
    const rows = filteredContacts.map(contact => [
      contact.name,
      contact.email || '',
      contact.title || '',
      contact.company || '',
      contact.linkedin_url || '',
      contact.channel,
      contact.status,
      contact.icp_score?.toString() || '',
      new Date(contact.created_at).toLocaleDateString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contacts-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: 'Exported!',
      description: `${filteredContacts.length} contacts exported to CSV`,
    });
  };

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 space-y-6">
        {/* Header - Clean */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Contacts</h1>
            <p className="text-sm text-muted-foreground/70 mt-0.5">
              <span className="font-medium text-foreground">{stats.total}</span> total
              {stats.reached_out > 0 && <> · <span className="font-medium text-foreground">{stats.reached_out}</span> reached out</>}
              {stats.replied > 0 && <> · <span className="font-medium text-emerald-500">{stats.replied}</span> replied</>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={exportToCSV}
              disabled={filteredContacts.length === 0}
              className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              <i className="fa-solid fa-download mr-1.5" />
              Export
            </Button>
            <Button
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              className="h-8 px-3 text-xs"
            >
              <i className="fa-solid fa-plus mr-1.5" />
              Add
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-10 h-10 rounded-full border text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Tabs - Minimal */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="w-full">
          <TabsList className="h-auto flex gap-4 bg-transparent p-0 justify-start overflow-x-auto border-b border-border/50 pb-0">
            {[
              { key: 'all', label: 'All', count: stats.total },
              { key: 'email', label: 'Email', count: stats.email },
              { key: 'linkedin', label: 'LinkedIn', count: stats.linkedin },
              { key: 'reached_out', label: 'Reached Out', count: stats.reached_out },
              { key: 'replied', label: 'Replied', count: stats.replied },
            ].map(tab => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className={cn(
                  'flex items-center gap-1.5 px-1 pb-2 text-sm font-medium transition-all border-b-2 rounded-none bg-transparent shrink-0',
                  activeTab === tab.key
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
                <span className="text-xs text-muted-foreground/60">
                  {tab.count}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center animate-pulse mb-3">
                  <img src={capyLogo} alt="Loading" className="h-7 w-7" />
                </div>
                <p className="text-sm text-muted-foreground">Loading contacts...</p>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-16 rounded-xl border border-dashed bg-muted/20">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-muted mb-4">
                  <i className="fa-solid fa-users h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-semibold text-lg mb-1">No contacts found</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {searchQuery ? 'Try a different search' : 'Start finding leads on the Email or LinkedIn pages'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead className="bg-muted/50">
                      <tr className="text-left text-xs font-medium text-muted-foreground">
                        <th className="px-4 py-3 whitespace-nowrap">Contact</th>
                        <th className="px-4 py-3 whitespace-nowrap">Company</th>
                        <th className="px-4 py-3 whitespace-nowrap">Channel</th>
                        <th className="px-4 py-3 whitespace-nowrap">Status</th>
                        <th className="px-4 py-3 whitespace-nowrap">Score</th>
                        <th className="px-4 py-3 whitespace-nowrap">Added</th>
                        <th className="px-4 py-3 whitespace-nowrap w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredContacts.map((contact) => (
                        <tr
                          key={contact.id}
                          className="hover:bg-muted/30 transition-colors cursor-pointer group"
                          onClick={() => openContactDetail(contact)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 min-w-[180px] max-w-[250px]">
                              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <i className="fa-solid fa-circle-user h-5 w-5 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-sm truncate">{contact.name}</p>
                                  {contact.source === 'custom' && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-600 font-medium">Custom</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {contact.email || contact.title || 'No email'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 max-w-[150px]">
                              <i className="fa-solid fa-building h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm truncate">{contact.company || '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              {getChannelIcon(contact.channel)}
                              <span className="text-xs capitalize">{contact.channel}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getStatusBadge(contact.status)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {contact.icp_score !== null ? (
                              <span className={cn(
                                'text-xs font-bold px-1.5 py-0.5 rounded',
                                contact.icp_score >= 70 ? 'bg-forest/20 text-forest' :
                                contact.icp_score >= 40 ? 'bg-sand/20 text-sand' :
                                'bg-muted text-muted-foreground'
                              )}>
                                {contact.icp_score}%
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(contact.created_at), { addSuffix: true })}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              onClick={(e) => openDeleteDialog(contact, e)}
                            >
                              <i className="fa-solid fa-trash h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
            <DialogDescription>
              Add a custom contact to your list manually.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="John Smith"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@company.com"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn URL</Label>
              <Input
                id="linkedin"
                placeholder="https://linkedin.com/in/johnsmith"
                value={newContact.linkedin_url}
                onChange={(e) => setNewContact({ ...newContact, linkedin_url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="CEO"
                  value={newContact.title}
                  onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  placeholder="Acme Inc"
                  value={newContact.company}
                  onChange={(e) => setNewContact({ ...newContact, company: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addContact} disabled={saving} className="bg-forest hover:bg-forest/90">
              {saving ? (
                <>
                  <i className="fa-solid fa-arrows-rotate fa-spin h-4 w-4 mr-2" />
                  Adding...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-plus h-4 w-4 mr-2" />
                  Add Contact
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <i className="fa-solid fa-circle-user h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  {selectedContact?.name}
                  {selectedContact?.source === 'custom' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600 font-medium">Custom</span>
                  )}
                </div>
                <p className="text-sm font-normal text-muted-foreground">
                  {selectedContact?.title} {selectedContact?.company && `at ${selectedContact.company}`}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedContact && (
            <div className="flex-1 overflow-y-auto space-y-4 py-4">
              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                {selectedContact.email && (
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-envelope h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedContact.email}</span>
                  </div>
                )}
                {selectedContact.linkedin_url && (
                  <div className="flex items-center gap-2">
                    <i className="fa-brands fa-linkedin h-4 w-4 text-[#0A66C2]" />
                    <a
                      href={selectedContact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#0A66C2] hover:underline flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      LinkedIn Profile
                      <i className="fa-solid fa-arrow-up-right-from-square h-3 w-3" />
                    </a>
                  </div>
                )}
                {selectedContact.company && (
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-building h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedContact.company}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-clock h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Added {formatDistanceToNow(new Date(selectedContact.created_at), { addSuffix: true })}</span>
                </div>
              </div>

              {/* Status and Score */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  {getStatusBadge(selectedContact.status)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Channel:</span>
                  {getChannelIcon(selectedContact.channel)}
                  <span className="text-sm capitalize">{selectedContact.channel}</span>
                </div>
                {selectedContact.icp_score !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">ICP Score:</span>
                    <span className={cn(
                      'text-xs font-bold px-1.5 py-0.5 rounded',
                      selectedContact.icp_score >= 70 ? 'bg-forest/20 text-forest' :
                      selectedContact.icp_score >= 40 ? 'bg-sand/20 text-sand' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {selectedContact.icp_score}%
                    </span>
                  </div>
                )}
              </div>

              {/* Email Thread */}
              {(selectedContact.channel === 'email' || selectedContact.channel === 'both') && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-comment h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">Email Conversation</h3>
                  </div>

                  {loadingThread ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center animate-pulse">
                        <img src={capyLogo} alt="Loading" className="h-5 w-5" />
                      </div>
                      <span className="ml-2 text-sm text-muted-foreground">Loading conversation...</span>
                    </div>
                  ) : emailThread.length === 0 ? (
                    <div className="text-center py-8 bg-muted/20 rounded-lg border border-dashed">
                      <i className="fa-solid fa-envelope h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No email conversation yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Send an email to start the conversation
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {emailThread.map((email) => (
                        <div
                          key={email.id}
                          className={cn(
                            'p-4 rounded-lg border',
                            email.direction === 'outbound'
                              ? 'bg-forest/5 border-forest/20 ml-4'
                              : 'bg-blue-500/5 border-blue-500/20 mr-4'
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {email.direction === 'outbound' ? (
                                <i className="fa-solid fa-paper-plane h-3.5 w-3.5 text-forest" />
                              ) : (
                                <i className="fa-solid fa-envelope h-3.5 w-3.5 text-blue-500" />
                              )}
                              <span className="text-xs font-medium">
                                {email.direction === 'outbound' ? 'You sent' : 'They replied'}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(email.sent_at), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            {email.subject}
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{email.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* LinkedIn-only contacts */}
              {selectedContact.channel === 'linkedin' && (
                <div className="text-center py-8 bg-muted/20 rounded-lg border border-dashed">
                  <i className="fa-brands fa-linkedin h-8 w-8 mx-auto text-[#0A66C2] mb-2" />
                  <p className="text-sm text-muted-foreground">LinkedIn contact</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reach out via LinkedIn to start a conversation
                  </p>
                  {selectedContact.linkedin_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => window.open(selectedContact.linkedin_url!, '_blank')}
                    >
                      <i className="fa-brands fa-linkedin h-4 w-4 mr-2" />
                      Open LinkedIn
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => {
                setDetailDialogOpen(false);
                setDeleteDialogOpen(true);
              }}
            >
              <i className="fa-solid fa-trash h-4 w-4 mr-2" />
              Delete
            </Button>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedContact?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteContact}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <i className="fa-solid fa-arrows-rotate fa-spin h-4 w-4 mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-trash h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ContactsPanel;
